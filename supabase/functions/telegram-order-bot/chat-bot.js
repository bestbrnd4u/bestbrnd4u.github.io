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
        strap: "Ремінь / ручки: {value}.",
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
        strap: "Strap / handles: {value}.",
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
        strap: "Ремень / ручки: {value}.",
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

// ── Базові діалоги ─────────────────────────────────────────────────
//
// Раніше «ок», «👍», «до побачення», «як справи», «ти бот?» бот не
// розумів і ПЕРЕДАВАВ МЕНЕДЖЕРУ — тобто кожне «дякую» будило власника.
// Заміряно корпусом із 76 живих фраз: 17 влучань до цих правок.

const GREETINGS = ["привіт", "вітаю", "добрий", "доброго", "доброї", "добрий день", "здрав", "привет", "добрый", "доброе", "доброй", "hello", "hi$", "hey$", "hiya", "good morning", "good afternoon", "good evening", "салют", "хай$"];

// Порядок має значення: перевіряється згори вниз, і перший збіг перемагає.
const YES_NO = ["так$", "ні$", "да$", "нет$", "yes$", "no$", "ага$", "угу$"];

const SMALL = [
    { key: "bye", stems: ["до побачення", "бувай", "до зустрічі", "на все добре", "гарного дня", "гарного вечора", "до свидания", "пока$", "всего доброго", "хорошего дня", "bye", "goodbye", "see you", "have a nice day"] },
    { key: "about-bot", stems: ["ти бот", "ви бот", "це бот", "ты бот", "вы бот", "это бот", "робот", "з ким я", "с кем я", "хто ти", "хто ви", "кто ты", "кто вы", "що ти вмієш", "що ви вмієте", "що можеш", "чем можешь", "что умеешь", "что ты умеешь", "чим можеш", "чим допоможеш", "are you a bot", "are you human", "are you real", "is this a bot", "who are you", "what can you do", "how can you help", "можеш допомогти", "можете допомогти", "чим можете", "з чим ти", "з чим ви", "чем можете", "с чем ты", "с чем вы", "допоможіть", "допоможи", "допомога", "потрібна допомога", "помогите", "помощь", "нужна помощь", "help$", "need help", "help me"] },
    { key: "compliment", stems: ["подобаю", "всі подобаю", "все нравятся", "i like them all", "класн", "клас$", "круто", "крут$", "молодц", "дуже гарн", "гарний магазин", "гарний сайт", "подобаєт", "сподобал", "нравит", "понравил", "люблю ваш", "відмінн", "отличн", "супер магазин", "nice shop", "great shop", "love your", "love this", "awesome", "amazing", "well done", "good job"] },
    { key: "anyone", stems: ["є хтось", "хтось є", "хтось тут", "ви тут", "ви на зв", "на звʼязку?", "алло", "ау$", "есть кто", "кто-нибудь", "вы тут", "вы здесь", "anyone there", "is anyone", "are you there", "hello?"] },
    { key: "smalltalk", stems: ["як справи", "як ти", "як ви", "як життя", "как дела", "как ты", "как вы", "how are you", "how's it going", "what's up"] },
    { key: "ack", stems: ["я тут$", "я здесь$", "i'm here", "ок$", "окей", "ok$", "okay", "оке$", "добре$", "гаразд", "зрозуміл", "ясно", "чудово", "супер", "клас$", "понятно", "хорошо", "ладно", "отлично", "got it", "fine$", "great$", "cool$", "perfect", "alright", "sounds good", "так$", "ні$", "да$", "нет$", "yes$", "no$", "ага$", "угу$", "дяку", "спасиб", "благодар", "thank", "thx", "ty$", "ні дякую", "нет спасибо", "no thanks"] }
];

// Повідомлення без жодної літери чи цифри: «👍», «🙂», «!!!».
function onlyEmoji(text) {
    return !/[\p{L}\p{N}]/u.test(String(text || "")) && /\S/.test(String(text || ""));
}

export function smallTalk(text) {
    const list = words(text);
    // Самий «?» — людина чекає реакції, а не «добре»: «Так, я тут!».
    // «+» в Instagram-стилі — «цікавить, розкажіть», а не «добре».
    if (/^\s*\++\s*$/.test(String(text || ""))) return null;
    if (onlyEmoji(text)) return /\?/.test(text) ? "anyone" : /[😍🥰😻❤♥💖💕💗🔥🤩😘]/u.test(text) ? "compliment" : "ack";
    // Довге повідомлення — це вже питання, навіть якщо в ньому є «дякую»:
    // «дякую, а доставка скільки?» — про доставку.
    if (list.length > 6) return null;
    const hit = SMALL.find(s => hasStem(list, s.stems));
    // «Так», «ні», «да» — згода лише коротким повідомленням без питання:
    // у «чому у вас так дешево?» «так» — прислівник, а не відповідь.
    if (hit && hit.key === "ack" && (list.length > 2 || /\?/.test(String(text)))
        && !hasStem(list, hit.stems.filter(x => !YES_NO.includes(x)))) return null;
    return hit ? hit.key : null;
}

const T4 = {
    uk: {
        ack: "Добре! Якщо щось знадобиться — пишіть, я тут.",
        compliment: "Дякуємо, дуже приємно! Якщо щось знадобиться — пишіть.",
        authYes: "Так, усі речі в каталозі оригінальні — без реплік і копій.",
        thanks: "Будь ласка! Якщо буде ще питання — пишіть.",
        bye: "Гарного дня! Будемо раді бачити вас знову 🙂",
        smalltalk: "Дякую, все добре! Чим можу допомогти — підібрати річ чи розповісти про доставку й оплату?",
        aboutBot: "Я бот-помічник BestBrnd4u. Можу підібрати річ за вашим побажанням (тип, для кого, бренд, колір, бюджет), розповісти про доставку, оплату, оригінальність і повернення, підказати стан замовлення. Менеджер бачить цю розмову й підключиться, якщо треба, — або напишіть «покличте менеджера».",
        howToOrder: "Оформити замовлення просто, реєстрація не потрібна:\n1. Відкрийте товар і натисніть «Купити» — він потрапить у кошик.\n2. У кошику натисніть «Оформити замовлення».\n3. Вкажіть імʼя, телефон, місто й відділення Нової пошти (або поштомат чи курʼєра).\n4. Оберіть оплату: карткою або при отриманні.\nПісля цього менеджер звʼяжеться з вами, щоб підтвердити замовлення.",
        cheaper: "Ось варіанти дешевше:",
        cheapest: "Ось найдоступніші варіанти:",
        noCheaper: "Дешевше в цьому розділі зараз нічого немає — це найдоступніші варіанти. Можу підібрати щось з іншого розділу або покликати менеджера.",
        broken: "Вибачте за незручність! Передаю менеджеру — він допоможе оформити замовлення або розбереться, що пішло не так.",
        cancel: "Скасувати чи змінити замовлення може менеджер — передаю йому вашу розмову. Вкажіть, будь ласка, номер замовлення, щоб було швидше.",
        sorry: "Нам дуже шкода, що так вийшло. Передаю розмову менеджеру — він розбереться й відповість тут.",
        abroad: "Про доставку за кордон краще уточнити в менеджера — передаю питання.",
        lost: "Перевірити, де замовлення, можна тут: {url} — потрібні номер і телефон. Я також передав ваше питання менеджеру: він подивиться й відповість тут.",
        warranty: "Умови гарантії й повернення — на сторінці: {url}. Якщо з річчю щось не так — опишіть тут, менеджер допоможе."
    },
    en: {
        ack: "Great! If you need anything, just write — I'm here.",
        compliment: "Thank you, that's really nice to hear! Write if you need anything.",
        authYes: "Yes, everything in our catalog is authentic — no replicas or copies.",
        thanks: "You're welcome! Write if you have more questions.",
        bye: "Have a nice day! We'll be glad to see you again 🙂",
        smalltalk: "I'm fine, thanks! How can I help — pick an item or tell you about delivery and payment?",
        aboutBot: "I'm the BestBrnd4u assistant bot. I can pick an item for you (type, who it's for, brand, color, budget), tell you about delivery, payment, authenticity and returns, and help you check your order status. A manager sees this chat and will join if needed — or just write “call a manager”.",
        howToOrder: "Ordering is easy, no registration needed:\n1. Open the item and press “Buy” — it goes to the cart.\n2. In the cart press “Checkout”.\n3. Enter your name, phone, city and Nova Poshta branch (or parcel locker or courier).\n4. Choose payment: by card or on delivery.\nA manager will then contact you to confirm the order.",
        cheaper: "Here are cheaper options:",
        cheapest: "Here are the most affordable options:",
        noCheaper: "There's nothing cheaper in this category right now — those are the most affordable options. I can look in another category or call a manager.",
        broken: "Sorry for the trouble! I'm passing this to a manager — they will help you place the order or figure out what went wrong.",
        cancel: "A manager can cancel or change an order — I'm passing the chat to them. Please add your order number to make it faster.",
        sorry: "We're really sorry about that. I'm passing the chat to a manager — they will look into it and reply here.",
        abroad: "It's best to check international delivery with a manager — I'm passing your question on.",
        lost: "You can check where your order is here: {url} — you'll need the number and phone. I've also passed your question to a manager: they will look and reply here.",
        warranty: "Warranty and return terms are on this page (in Ukrainian — that version is legally binding): {url}. If something is wrong with the item, describe it here and a manager will help."
    },
    ru: {
        ack: "Хорошо! Если что-то понадобится — пишите, я здесь.",
        compliment: "Спасибо, очень приятно! Если что-то понадобится — пишите.",
        authYes: "Да, все вещи в каталоге оригинальные — без реплик и копий.",
        thanks: "Пожалуйста! Если будут еще вопросы — пишите.",
        bye: "Хорошего дня! Будем рады видеть вас снова 🙂",
        smalltalk: "Спасибо, все хорошо! Чем могу помочь — подобрать вещь или рассказать о доставке и оплате?",
        aboutBot: "Я бот-помощник BestBrnd4u. Могу подобрать вещь по вашему пожеланию (тип, для кого, бренд, цвет, бюджет), рассказать о доставке, оплате, оригинальности и возврате, подсказать состояние заказа. Менеджер видит этот чат и подключится, если нужно, — или напишите «позовите менеджера».",
        howToOrder: "Оформить заказ просто, регистрация не нужна:\n1. Откройте товар и нажмите «Купить» — он попадет в корзину.\n2. В корзине нажмите «Оформить заказ».\n3. Укажите имя, телефон, город и отделение Новой почты (или почтомат либо курьера).\n4. Выберите оплату: картой или при получении.\nПосле этого менеджер свяжется с вами, чтобы подтвердить заказ.",
        cheaper: "Вот варианты дешевле:",
        cheapest: "Вот самые доступные варианты:",
        noCheaper: "Дешевле в этом разделе сейчас ничего нет — это самые доступные варианты. Могу подобрать что-то из другого раздела или позвать менеджера.",
        broken: "Извините за неудобство! Передаю менеджеру — он поможет оформить заказ или разберется, что пошло не так.",
        cancel: "Отменить или изменить заказ может менеджер — передаю ему ваш разговор. Укажите, пожалуйста, номер заказа, чтобы было быстрее.",
        sorry: "Нам очень жаль, что так вышло. Передаю разговор менеджеру — он разберется и ответит здесь.",
        abroad: "О доставке за границу лучше уточнить у менеджера — передаю вопрос.",
        lost: "Проверить, где заказ, можно здесь: {url} — понадобятся номер и телефон. Я также передал ваш вопрос менеджеру: он посмотрит и ответит здесь.",
        warranty: "Условия гарантии и возврата — на странице (на украинском, юридически действующей является эта версия): {url}. Если с вещью что-то не так — опишите здесь, менеджер поможет."
    }
};

// Намір → основи слів. Ці питання бот не закриває сам — лише чесно
// каже, що далі людина, і будить власника.
const ESCALATE = [
    { key: "cancel", stems: ["скасув", "відмін", "відмов", "змінити замовлен", "змінити адрес", "отмен", "изменить заказ", "изменить адрес", "cancel", "change my order", "change the order", "change address"] },
    { key: "broken", stems: ["не працює", "не працюють", "не відкрива", "не можу оформ", "не виходить оформ", "не вдається", "помилк", "глюч", "зависа", "не работает", "не открывается", "не могу оформ", "не получается", "ошибк", "глючит", "doesn't work", "does not work", "not working", "can't checkout", "cannot checkout", "can't order", "error", "bug$", "broken"] },
    { key: "sorry", stems: ["не той товар", "не та сумка", "не той колір", "не той розмір", "не те що замовл", "не те, що замовл", "прийшло не те", "прийшла не та", "прийшов не той", "прислали не", "надіслали не", "пришла не та", "пришел не тот", "пришло не то", "прислали не то", "не то что заказ", "wrong item", "wrong product", "not what i ordered", "sent the wrong", "жахлив", "огидн", "незадовол", "розчарован", "погано", "обман", "шахра", "кидал", "скарг", "ужасн", "отвратит", "недовол", "разочаров", "плохо", "мошенн", "жалоб", "terrible", "awful", "horrible", "disappointed", "unhappy", "scam", "fraud", "complaint", "worst"] },
    { key: "abroad", stems: ["за кордон", "закордон", "за межі україни", "в європ", "в польщ", "в німеччин", "за границ", "в европ", "в польш", "в германи", "abroad", "international", "outside ukraine", "ship to poland", "ship to germany", "ship to europe", "worldwide", "to poland", "to germany", "to usa", "to the us"] }
];

const ABOUT_FIRST = ["ти людина", "ти справжн", "ти жива", "ти живий", "ви людина", "ви справжн", "ви жива", "ви живий", "ти бот", "ви бот", "ты человек", "ты настоящ", "ты живой", "ты живая", "вы человек", "вы настоящ", "вы живой", "ты бот", "вы бот", "are you human", "are you a human", "are you real", "are you a real", "are you a bot", "is this a bot", "am i talking to", "real person?"];

const LOST = ["не прийш", "не отрима", "не получ", "загуби", "потерял", "де посилк", "де моя посилк", "где посылк", "где моя посылк", "коли приїде", "коли прийде", "когда приедет", "когда придет", "where is my parcel", "where is my package", "my package", "my parcel", "hasn't arrived", "not arrived", "didn't arrive", "didn't receive"];

const HOW_TO_ORDER = ["як оформ", "як замов", "як купи", "як зробити замовлен", "як придбат", "як офор", "как оформ", "как заказ", "как купи", "как сделать заказ", "как приобрест", "how do i order", "how to order", "how can i order", "how to buy", "how do i buy", "how can i buy", "place an order", "без реєстрац", "без регистрац", "реєстр", "зареєстр", "регистр", "зарегистр", "without registration", "need an account", "create an account", "sign up"];

const CHEAPER = ["дешевш", "дешевле", "подешевш", "подешевл", "дорого", "дорогувато", "дороговато", "не по кишені", "бюджетніш", "бюджетнее", "cheaper", "less expensive", "too expensive", "expensive", "more affordable"];

const WARRANTY = ["гаранті", "гарант", "warranty", "guarantee", "брак", "дефект", "зламал", "сломал", "defect", "broke$"];

// ── Живіші відповіді ───────────────────────────────────────────────
//
// Побажання власника (09.11.2026): «привіт» — у відповідь «привіт», а не
// абзац про бота; «хочу штани» — «штанів немає, зате є сумки…»; підбірка
// — словами людини: «ось чорні сумки, які є», а не «ось що підходить».

// Привітання у відповідь — тим самим словом, яким привітались.
const GREET_BACK = {
    uk: [[["доброго ранку", "добрий ранок", "добрий ранку"], "Доброго ранку"], [["добрий вечір", "доброго вечора", "добрий вечер"], "Добрий вечір"],
        [["добрий день", "доброго дня", "добридень"], "Добрий день"], [["привіт", "привітик", "хай$", "салют"], "Привіт"], [["вітаю", "здрастуйте", "здравствуйте"], "Вітаю"]],
    en: [[["good morning"], "Good morning"], [["good evening"], "Good evening"], [["good afternoon"], "Good afternoon"],
        [["hello", "hiya"], "Hello"], [["hey$"], "Hey"], [["hi$"], "Hi"]],
    ru: [[["доброе утро", "доброго утра"], "Доброе утро"], [["добрый вечер", "доброго вечера"], "Добрый вечер"], [["добрый день", "доброго дня"], "Добрый день"],
        [["привет", "приветик", "салют"], "Привет"], [["здравствуй", "здрасте", "здрасьте"], "Здравствуйте"]]
};

export function greetingOf(text, lang) {
    const list = words(text);
    // Привітання — на початку повідомлення: «скажіть, привіт від кого» — ні.
    const head = list.slice(0, 3);
    const table = GREET_BACK[lang] || GREET_BACK.uk;
    for (const [stems, back] of table) if (hasStem(head, stems)) return back;
    // Привіталися іншою мовою, ніж сторінка («привет» на /uk/) — відповідаємо мовою сторінки.
    for (const l of ["uk", "ru", "en"]) for (const [stems] of GREET_BACK[l]) if (hasStem(head, stems)) return table[table.length - 1][1];
    return "";
}

const T5 = {
    uk: {
        hello: "{greet}! 👋 Чим можу допомогти? Можу підібрати сумку, годинник чи окуляри — просто напишіть, що шукаєте, — або підказати щодо доставки й оплати.",
        here: "Ось {desc}, які є зараз 👇",
        hereMany: "Ось {desc} — усього {total} {variants}, показую {k} 👇",
        hereMore: "Ще {desc} — {from}–{to} з {total} 👇",
        things: "речі",
        missing: "На жаль, {what} у нас зараз немає 😔 Ми спеціалізуємося на сумках, годинниках, окулярах, кросівках і гаманцях — подивитесь, що є? Якщо потрібна конкретна річ, менеджер підкаже, чи можна привезти її під замовлення.",
        missingSimilar: "{What} у нас зараз немає, але є {similar} 👇",
        variants: ["варіант", "варіанти", "варіантів"]
    },
    en: {
        hello: "{greet}! 👋 How can I help? I can pick a bag, a watch or sunglasses for you — just tell me what you're looking for — or help with delivery and payment.",
        here: "Here are the {desc} we have right now 👇",
        hereMany: "Here are the {desc} — {total} {variants} in total, showing {k} 👇",
        hereMore: "More {desc} — {from}–{to} of {total} 👇",
        things: "items",
        missing: "Sorry, we don't have {what} right now 😔 We specialize in bags, watches, sunglasses, sneakers and wallets — want to take a look? If you need a specific item, a manager can tell you whether we can bring it to order.",
        missingSimilar: "We don't have {what} right now, but we do have {similar} 👇",
        variants: ["option", "options", "options"]
    },
    ru: {
        hello: "{greet}! 👋 Чем могу помочь? Могу подобрать сумку, часы или очки — просто напишите, что ищете, — или подсказать по доставке и оплате.",
        here: "Вот {desc}, которые есть сейчас 👇",
        hereMany: "Вот {desc} — всего {total} {variants}, показываю {k} 👇",
        hereMore: "Еще {desc} — {from}–{to} из {total} 👇",
        things: "вещи",
        missing: "К сожалению, {what} у нас сейчас нет 😔 Мы специализируемся на сумках, часах, очках, кроссовках и кошельках — посмотрите, что есть? Если нужна конкретная вещь, менеджер подскажет, можно ли привезти ее под заказ.",
        missingSimilar: "{What} у нас сейчас нет, но есть {similar} 👇",
        variants: ["вариант", "варианта", "вариантов"]
    }
};

// 1 варіант, 2 варіанти, 5 варіантів (так само російською).
export function plural(n, forms, lang) {
    if (lang === "en") return n === 1 ? forms[0] : forms[1];
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b === 1) return forms[0];
    if (b >= 2 && b <= 4) return forms[1];
    return forms[2];
}

// Опис запиту словами: «чорні жіночі сумки Coach до 8 000 ₴».
const DESC = {
    uk: {
        color: { "Чорн": "чорні", "Біл": "білі", "Коричн": "коричневі", "Беж": "бежеві", "Сір": "сірі", "Рожев": "рожеві", "Син": "сині", "Зелен": "зелені", "Золот": "золотисті", "Срібл": "сріблясті", "Червон": "червоні" },
        gender: { "Жінкам": "жіночі", "Чоловікам": "чоловічі" },
        type: { bags: "сумки", watches: "годинники", glasses: "окуляри", sneakers: "кросівки", wallets: "гаманці" },
        upTo: "до", from: "від", sale: "зі знижкою", fresh: "новинки"
    },
    en: {
        color: { "Чорн": "black", "Біл": "white", "Коричн": "brown", "Беж": "beige", "Сір": "grey", "Рожев": "pink", "Син": "blue", "Зелен": "green", "Золот": "gold", "Срібл": "silver", "Червон": "red" },
        gender: { "Жінкам": "women's", "Чоловікам": "men's" },
        type: { bags: "bags", watches: "watches", glasses: "sunglasses", sneakers: "sneakers", wallets: "wallets" },
        upTo: "under", from: "from", sale: "on sale", fresh: "new arrivals"
    },
    ru: {
        color: { "Чорн": "черные", "Біл": "белые", "Коричн": "коричневые", "Беж": "бежевые", "Сір": "серые", "Рожев": "розовые", "Син": "синие", "Зелен": "зеленые", "Золот": "золотистые", "Срібл": "серебристые", "Червон": "красные" },
        gender: { "Жінкам": "женские", "Чоловікам": "мужские" },
        type: { bags: "сумки", watches: "часы", glasses: "очки", sneakers: "кроссовки", wallets: "кошельки" },
        upTo: "до", from: "от", sale: "со скидкой", fresh: "новинки"
    }
};

export function describeWish(wish, lang) {
    const D = DESC[lang] || DESC.uk;
    const parts = [];
    // «Найдешевші сумки» — так і в заголовку, а не просто «сумки».
    if (wish.pricey) parts.push({ uk: "найдорожчі", en: "most expensive", ru: "самые дорогие" }[lang]);
    else if (wish.cheap && !(wish.budget && wish.budget.max)) parts.push({ uk: "найдоступніші", en: "most affordable", ru: "самые доступные" }[lang]);
    if (wish.color && D.color[wish.color]) parts.push(D.color[wish.color]);
    if (wish.gender && D.gender[wish.gender]) parts.push(D.gender[wish.gender]);
    // Бренд англійською — перед типом («Coach bags»), українською й
    // російською — після («сумки Coach»).
    if (lang === "en" && wish.brand) parts.push(wish.brand);
    // Годинник «зі шкіри» не кажуть — шкіряний у нього ремінець.
    const strap = wish.material === "leather" && wish.type === "watches";
    if (lang === "en" && wish.material && !strap) parts.push(wish.material === "vegan" ? "vegan leather" : "leather");
    const modelName = wish.models && wish.models.names && wish.models.names.join(" ");
    if (!wish.type && modelName) parts.push(lang === "en" ? `${modelName} models` : `${lang === "ru" ? "модели" : "моделі"} ${modelName}`);
    else if (wish.style && STYLES.find(x => x.key === wish.style) && !STYLES.find(x => x.key === wish.style).anyType) parts.push(STYLES.find(x => x.key === wish.style).name[lang]);
    else parts.push(wish.type ? D.type[wish.type] : (wish.fresh ? D.fresh : T5[lang].things));
    if (wish.style === "stones") parts.push({ uk: "з кристалами", en: "with crystals", ru: "с кристаллами" }[lang]);
    if (wish.type && modelName) parts.push(modelName);
    if (lang !== "en" && wish.brand) parts.push(wish.brand);
    if (strap) parts.push({ uk: "на шкіряному ремінці", en: "with a leather strap", ru: "на кожаном ремешке" }[lang]);
    else if (wish.material && lang !== "en") parts.push({ leather: { uk: "зі шкіри", ru: "из кожи" }, vegan: { uk: "з екошкіри", ru: "из экокожи" } }[wish.material][lang]);
    if (wish.band === "metal") parts.push({ uk: "на металевому браслеті", en: "with a metal bracelet", ru: "на металлическом браслете" }[lang]);
    if (wish.size) parts.push(lang === "en" ? `size ${wish.size}` : `${wish.size} ${lang === "ru" ? "размера" : "розміру"}`);
    if (wish.sale) parts.push(D.sale);
    if (wish.inStock) parts.push({ uk: "в наявності", en: "in stock", ru: "в наличии" }[lang]);
    if (wish.noLogo) parts.push({ uk: "без фірмового принту", en: "without an all-over logo print", ru: "без фирменного принта" }[lang]);
    if (wish.neutral) parts.push({ uk: "спокійних кольорів", en: "in neutral colours", ru: "спокойных цветов" }[lang]);
    if (wish.light) parts.push({ uk: "світлих кольорів", en: "in light colours", ru: "светлых цветов" }[lang]);
    if (wish.budget && wish.budget.max && wish.budget.min) parts.push(`${D.from} ${botMoney(wish.budget.min)} ${D.upTo} ${botMoney(wish.budget.max)}`);
    else if (wish.budget && wish.budget.max) parts.push(`${D.upTo} ${botMoney(wish.budget.max)}`);
    else if (wish.budget && wish.budget.min) parts.push(`${D.from} ${botMoney(wish.budget.min)}`);
    let out = parts.join(" ");
    if (wish.notColors && wish.notColors.length) {
        const NOT = { uk: ["крім", "і"], en: ["except", "and"], ru: ["кроме", "и"] }[lang];
        const names = wish.notColors.map(c => (COLOR_GEN[lang] || {})[c]).filter(Boolean);
        if (names.length) out += `, ${NOT[0]} ${names.join(` ${NOT[1]} `)}`;
    }
    return out;
}

// Чого в магазині немає. Відповідь — «на жаль, штанів немає», і що є
// натомість; для взуття — одразу кросівки (єдине взуття в каталозі).
const MISSING = [
    { key: "jeans", stems: ["джинс", "jeans", "denim"], what: { uk: "джинсів", en: "jeans", ru: "джинсов" } },
    { key: "pants", stems: ["штан", "брюк", "легінс", "легинс", "лосин", "pants", "trousers", "leggings"], what: { uk: "штанів", en: "pants", ru: "брюк" } },
    { key: "dress", stems: ["сукн", "сукен", "суконь", "плаття", "платт", "плать", "dress"], what: { uk: "суконь", en: "dresses", ru: "платьев" } },
    { key: "skirt", stems: ["спідниц", "юбк", "юбок", "skirt"], what: { uk: "спідниць", en: "skirts", ru: "юбок" } },
    { key: "shorts", stems: ["шорт", "shorts"], what: { uk: "шортів", en: "shorts", ru: "шорт" } },
    { key: "outer", stems: ["куртк", "курток", "пальт", "пуховик", "плащ", "тренч", "парк$", "jacket", "coat$", "coats$", "parka", "trench"], what: { uk: "верхнього одягу", en: "outerwear", ru: "верхней одежды" } },
    { key: "suit", stems: ["костюм", "піджак", "пиджак", "жакет", "suit$", "suits$", "blazer"], what: { uk: "костюмів і піджаків", en: "suits or blazers", ru: "костюмов и пиджаков" } },
    { key: "tops", stems: ["футболк", "сорочк", "рубашк", "рубах", "блуз", "топ$", "майка", "майки", "майку", "майок", "світшот", "свитшот", "худі", "худи", "толстовк", "светр", "свитер", "кофт", "лонгслів", "лонгслив", "одяг", "одежд", "t-shirt", "tshirt", "shirt", "blouse", "hoodie", "sweater", "sweatshirt", "clothes", "clothing"], what: { uk: "одягу", en: "clothing", ru: "одежды" } },
    { key: "underwear", stems: ["білизн", "белье", "белья", "купальн", "бікіні", "бикини", "lingerie", "underwear", "swimsuit", "bikini"], what: { uk: "білизни й купальників", en: "underwear or swimwear", ru: "белья и купальников" } },
    { key: "shoes", similar: "sneakers", stems: ["туфл", "туфел", "чобіт", "чоботи", "черевик", "ботин", "сапог", "сапож", "босоніж", "босонож", "сандал", "шльопан", "шлепан", "тапк", "тапоч", "лофер", "мокасин", "балетк", "мюл", "heels", "boots", "sandals", "loafers", "slippers", "flats", "pumps"], what: { uk: "такого взуття", en: "that kind of shoes", ru: "такой обуви" } },
    { key: "jewelry", stems: ["прикрас", "ювелір", "ювелир", "кільц", "каблучк", "сережк", "намист", "підвіск", "кулон", "кольц", "серьг", "ожерел", "цепочк", "ланцюжк", "украшен", "jewel", "ring$", "rings$", "earring", "necklace", "pendant"], what: { uk: "прикрас", en: "jewelry", ru: "украшений" } },
    { key: "beauty", stems: ["парфум", "парфюм", "духи$", "духів", "аромат", "туалетн", "косметик", "помад", "тональн", "perfume", "fragrance", "cologne", "makeup", "make-up", "cosmetic", "lipstick"], what: { uk: "парфумів і косметики", en: "perfume or cosmetics", ru: "парфюмерии и косметики" } },
    { key: "hats", stems: ["шапк", "шапок", "кепк", "кепок", "капелюх", "панам", "шарф", "хустк", "рукавиц", "рукавичк", "шляп", "перчат", "платок", "платк", "beanie", "hat$", "hats$", "cap$", "caps$", "scarf", "scarves", "gloves"], what: { uk: "шапок, шарфів і рукавичок", en: "hats, scarves or gloves", ru: "шапок, шарфов и перчаток" } },
    { key: "belts", stems: ["ремені", "ременів", "ремінц", "ремінець", "ремінь для", "ремень для", "ремни", "ремней", "пояс", "belt"], what: { uk: "ременів", en: "belts", ru: "ремней" } },
    { key: "cardholder", stems: ["візитниц", "визитниц"], what: { uk: "візитниць", en: "cardholders", ru: "визитниц" }, similar: "wallets" },
    { key: "kids", stems: ["дитяч", "детск", "для дитини", "для ребенка", "kids", "children", "baby"], what: { uk: "дитячих речей", en: "kids' items", ru: "детских вещей" } }
];

export function findMissing(text) {
    const list = words(text);
    return MISSING.find(m => hasStem(list, m.stems)) || null;
}

const T6 = {
    uk: { noSize: "{size}-го розміру зараз немає 😔 Є розміри: {list}. Якщо потрібен саме {size}-й — менеджер підкаже, чи можна привезти під замовлення.", sizeChip: "{size} розмір" },
    en: { noSize: "Size {size} isn't available right now 😔 Available sizes: {list}. If you need exactly {size}, a manager can tell you whether we can bring it to order.", sizeChip: "Size {size}" },
    ru: { noSize: "{size}-го размера сейчас нет 😔 Есть размеры: {list}. Если нужен именно {size}-й — менеджер подскажет, можно ли привезти под заказ.", sizeChip: "{size} размер" }
};

const T7 = {
    uk: {
        similar: "Ось схожі варіанти за ціною 👇",
        range: "{desc}: ціни від {min} до {max}, усього {n} {variants}. Ось найдоступніші 👇",
        count: "Зараз у нас {n} {variants}: {desc}, від {min} до {max}. Ось найдоступніші 👇"
    },
    en: {
        similar: "Here are similar options at a similar price 👇",
        range: "{desc}: prices from {min} to {max}, {n} {variants} in total. Here are the most affordable 👇",
        count: "We have {n} {variants} right now: {desc}, from {min} to {max}. Here are the most affordable 👇"
    },
    ru: {
        similar: "Вот похожие варианты по цене 👇",
        range: "{desc}: цены от {min} до {max}, всего {n} {variants}. Вот самые доступные 👇",
        count: "Сейчас у нас {n} {variants}: {desc}, от {min} до {max}. Вот самые доступные 👇"
    }
};

const T8 = {
    uk: {
        cart: "Додати сам я не можу, але це просто: відкрийте картку товару й натисніть «Купити» — він потрапить у кошик. Далі «Оформити замовлення», і все.",
        reserve: "Відкласти річ може менеджер — передаю йому вашу розмову. Він уточнить деталі тут же.",
        gift: "Гарна ідея! 🎁 Підкажіть, для кого подарунок і на який бюджет — наприклад «жіноча сумка до 8000» чи «чоловічий годинник». Або оберіть нижче:"
    },
    en: {
        cart: "I can't add it myself, but it's easy: open the item card and press “Buy” — it goes to the cart. Then “Checkout”, and that's it.",
        reserve: "A manager can reserve the item — I'm passing the chat to them. They will confirm the details right here.",
        gift: "Great idea! 🎁 Tell me who the gift is for and your budget — e.g. “women's bag under 8000” or “men's watch”. Or pick below:"
    },
    ru: {
        cart: "Добавить сам я не могу, но это просто: откройте карточку товара и нажмите «Купить» — он попадет в корзину. Дальше «Оформить заказ», и все.",
        reserve: "Отложить вещь может менеджер — передаю ему ваш разговор. Он уточнит детали здесь же.",
        gift: "Отличная идея! 🎁 Подскажите, для кого подарок и на какой бюджет — например «женская сумка до 8000» или «мужские часы». Или выберите ниже:"
    }
};

// «Перша», «друга», «№3», «second» → 1..4. null — номера немає.
const ORDINALS = [
    [1, ["перша$", "першу$", "першої$", "перший$", "першого$", "первая", "первую", "первой", "first", "1-ша", "1-а", "№1", "номер 1"]],
    [2, ["друга$", "другу$", "другої$", "другий$", "другого$", "вторая", "вторую", "второй", "second", "2-га", "2-а", "№2", "номер 2"]],
    [3, ["третя$", "третю$", "третьої$", "третій$", "третього$", "третья", "третью", "третьей", "third", "3-тя", "3-я", "№3", "номер 3"]],
    [4, ["четверта$", "четверту$", "четвертої$", "четвертий$", "четвертую", "четвертая", "fourth", "4-та", "4-я", "№4", "номер 4"]]
];

export function ordinalOf(text) {
    const list = words(text);
    // «Друг» — ще й «friend»: «подарунок другу» — це не «другий товар».
    if (hasStem(list, ["подарун", "подарок", "для друга", "другові", "другу на", "подруз", "подруг"])) return null;
    for (const [n, stems] of ORDINALS) {
        if (hasStem(list, stems.map(x => x.startsWith("№") || x.includes(" ") || /^\d/.test(x) ? x : x))) return n;
    }
    return null;
}

// Річ, про яку бот відповідав ОСТАННІМ повідомленням. Лише останнім:
// після нової підбірки «а розміри?» вже не про ту річ.
export function lastFocus(history) {
    const last = (history || []).slice().reverse().find(m => m && m.author === BOT_AUTHOR);
    const m = last && String(last.body || "").match(/\[\[focus: ([^\]]+)\]\]/);
    return m ? m[1].trim() : null;
}

// Товари з останньої відповіді бота, де вони були, — у тому ж порядку.
// Тип речей, які бот щойно показав, — якщо всі вони одного типу. Пам'ять
// запитів — лише три останні репліки людини, а уточнення бувають довшими:
// «годинник» → «жіночий» → «золотий» → «а сріблястий?» → «а на шкіряному
// ремінці?». Людина весь час уточнює те, що бачить на екрані.
export function shownType(history, data) {
    const bySlug = new Map((data && data.products || []).map(p => [p.slug, p]));
    const types = new Set(lastShownSlugs(history).map(slug => {
        const p = bySlug.get(slug);
        const t = p && TYPES.find(x => (x.category && x.category === p.category) || (x.department && x.department === p.department));
        return t ? t.key : "?";
    }));
    return types.size === 1 && !types.has("?") ? [...types][0] : null;
}

export function lastShownSlugs(history) {
    // Підбірка — лише відповідь із КАРТКАМИ («• Назва — ціна посилання»).
    // Відповідь про одну річ теж має посилання, але це не новий список:
    // інакше після «а четверта поляризована?» «перша» ставала тією четвертою.
    const isCard = l => /^•\s/.test(l) && /\/p\//.test(l);
    const last = (history || []).slice().reverse().find(m => m && m.author === BOT_AUTHOR && String(m.body || "").split("\n").some(isCard));
    if (!last) return [];
    return String(last.body).split("\n").filter(isCard).map(l => (l.match(/\/p\/([^/\s?#]+)\//) || [])[1]).filter(Boolean)
        .map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
}

const T9 = {
    uk: {
        phone: "Дякую! Передаю ваш номер менеджеру — він передзвонить вам найближчим часом (щодня 09:00–20:00).",
        sorryBot: "Вибачте, що не вийшло зрозуміти 🙏 Передаю розмову менеджеру — він відповість тут. А поки можете написати коротко, що шукаєте: «чорна сумка до 8000».",
        anyone: "Так, я тут! 🙂 Я бот-помічник, а менеджер бачить цю розмову й підключиться, якщо треба. Чим допомогти?",
        sizeGuide: "На сторінці кожного товару з розмірами є кнопка «Таблиця розмірів» — там мірки. Якщо сумніваєтесь між двома розмірами, напишіть сюди довжину стопи чи звичний розмір — менеджер підкаже."
    },
    en: {
        phone: "Thank you! I'm passing your number to a manager — they will call you back shortly (daily 09:00–20:00, Kyiv time).",
        sorryBot: "Sorry I couldn't get that 🙏 I'm passing the chat to a manager — they will reply here. Meanwhile you can write briefly what you're looking for: “black bag under 8000”.",
        anyone: "Yes, I'm here! 🙂 I'm the assistant bot, and a manager sees this chat and will join if needed. How can I help?",
        sizeGuide: "Every product page with sizes has a “Size chart” button with the measurements. If you're between two sizes, write your foot length or usual size here — a manager will advise."
    },
    ru: {
        phone: "Спасибо! Передаю ваш номер менеджеру — он перезвонит вам в ближайшее время (ежедневно 09:00–20:00).",
        sorryBot: "Извините, что не получилось понять 🙏 Передаю разговор менеджеру — он ответит здесь. А пока можете написать коротко, что ищете: «черная сумка до 8000».",
        anyone: "Да, я здесь! 🙂 Я бот-помощник, а менеджер видит этот чат и подключится, если нужно. Чем помочь?",
        sizeGuide: "На странице каждого товара с размерами есть кнопка «Таблица размеров» — там мерки. Если сомневаетесь между двумя размерами, напишите сюда длину стопы или привычный размер — менеджер подскажет."
    }
};

const T10 = {
    uk: {
        bargain: "Персональну знижку може погодити лише менеджер — передаю йому ваше питання. Діючі акції й знижки вже зараз — тут: {url}",
        photos: "Додаткові фото чи відео надішле менеджер — передаю йому ваше прохання. Він відповість тут же.",
        wholesale: "Щодо опту краще домовитись із менеджером — передаю йому вашу розмову.",
        restock: "Коли буде поповнення, точно скаже менеджер — передаю питання. Якщо річ потрібна вже, можемо привезти її під замовлення.",
        installment: "Щодо оплати частинами краще уточнити в менеджера — передаю ваше питання. Зараз на сайті можна оплатити карткою або при отриманні.",
        waterproof: "Про водостійкість конкретної моделі точно підкаже менеджер — передаю питання. Характеристики є й на сторінці товару.",
        callback: "Менеджер звʼяжеться з вами найближчим часом (щодня 09:00–20:00) — я нагадав йому про вас.",
        loyalty: "Про знижку для постійних клієнтів чи на перше замовлення скаже менеджер — я передав йому питання. Діючі акції — тут: {url}",
        certificate: "Про сертифікати — подарункові чи документи до речі — точно скаже менеджер, я передав йому питання. Звідки речі: з офіційних магазинів брендів у США.",
        origin: "Купуємо в офіційних магазинах брендів у США. Країну виробництва конкретної речі точно скаже менеджер — я передав йому питання.",
        marketplaces: "Продаємо через цей сайт. Про інші майданчики скаже менеджер — я передав йому питання.",
        business: "Про роботу з компаніями — рахунок, безготівкова оплата — домовитесь із менеджером, я передав йому питання.",
        care: "Порад із догляду в картках немає — підкаже менеджер, я передав йому питання.",
        promoPlans: "Плани акцій знає менеджер — я передав йому питання. Діючі знижки вже зараз — тут: {url}",
        aboutShop: "Про історію магазину краще розповість менеджер — я передав йому питання. Відгуки покупців — внизу сторінки кожного товару.",
        packaging: "Про пакування, коробку й документи до покупки точно скаже менеджер — я передав йому питання, він відповість тут.",
        specs: "Таких подробиць у картці товару немає — точно скаже менеджер, я передав йому питання. Усе, що відомо, — на сторінці товару.",
        weekend: "Так, працюємо {hours} — без вихідних. Бот відповідає цілодобово 🙂"
    },
    en: {
        bargain: "Only a manager can approve a personal discount — I'm passing your question on. Current sales and discounts are here: {url}",
        photos: "A manager will send more photos or a video — I'm passing your request on. They will reply right here.",
        wholesale: "For wholesale it's best to talk to a manager — I'm passing the chat to them.",
        restock: "A manager will tell you exactly when it's restocked — I'm passing your question on. If you need it now, we can bring it to order.",
        installment: "It's best to check paying in installments with a manager — I'm passing your question on. On the website you can pay by card or on delivery.",
        waterproof: "A manager will tell you exactly about this model's water resistance — I'm passing your question on. The specs are also on the product page.",
        callback: "A manager will contact you shortly (daily 09:00–20:00, Kyiv time) — I've reminded them about you.",
        loyalty: "A manager will tell you about discounts for regular customers or on a first order — I've passed your question on. Current sales are here: {url}",
        certificate: "A manager will tell you exactly about certificates — gift ones or documents for the item; I've passed your question on. Our items come from official brand stores in the USA.",
        origin: "We buy from official brand stores in the USA. A manager will tell you the country of manufacture of a specific item — I've passed your question on.",
        marketplaces: "We sell through this website. A manager will tell you about other platforms — I've passed your question on.",
        business: "For working with companies — invoices, bank transfer — please agree with a manager; I've passed your question on.",
        care: "There are no care tips in the product cards — a manager will advise, I've passed your question on.",
        promoPlans: "A manager knows the sale plans — I've passed your question on. Current discounts are here: {url}",
        aboutShop: "A manager will tell you more about the shop — I've passed your question on. Customer reviews are at the bottom of every product page.",
        packaging: "A manager will tell you exactly about packaging, the box and purchase documents — I've passed your question on, they will reply here.",
        specs: "That detail isn't in the product card — a manager will tell you exactly, I've passed your question on. Everything we know is on the product page.",
        weekend: "Yes, we work {hours} — no days off. The bot answers around the clock 🙂"
    },
    ru: {
        bargain: "Персональную скидку может согласовать только менеджер — передаю ему ваш вопрос. Действующие акции и скидки уже сейчас — здесь: {url}",
        photos: "Дополнительные фото или видео пришлет менеджер — передаю ему вашу просьбу. Он ответит здесь же.",
        wholesale: "По опту лучше договориться с менеджером — передаю ему ваш разговор.",
        restock: "Когда будет пополнение, точно скажет менеджер — передаю вопрос. Если вещь нужна уже, можем привезти ее под заказ.",
        installment: "По оплате частями лучше уточнить у менеджера — передаю ваш вопрос. Сейчас на сайте можно оплатить картой или при получении.",
        waterproof: "О водостойкости конкретной модели точно подскажет менеджер — передаю вопрос. Характеристики есть и на странице товара.",
        callback: "Менеджер свяжется с вами в ближайшее время (ежедневно 09:00–20:00) — я напомнил ему о вас.",
        loyalty: "О скидке для постоянных клиентов или на первый заказ скажет менеджер — я передал ему вопрос. Действующие акции — здесь: {url}",
        certificate: "О сертификатах — подарочных или документах к вещи — точно скажет менеджер, я передал ему вопрос. Откуда вещи: из официальных магазинов брендов в США.",
        origin: "Покупаем в официальных магазинах брендов в США. Страну производства конкретной вещи точно скажет менеджер — я передал ему вопрос.",
        marketplaces: "Продаем через этот сайт. О других площадках скажет менеджер — я передал ему вопрос.",
        business: "О работе с компаниями — счет, безналичная оплата — договоритесь с менеджером, я передал ему вопрос.",
        care: "Советов по уходу в карточках нет — подскажет менеджер, я передал ему вопрос.",
        promoPlans: "Планы акций знает менеджер — я передал ему вопрос. Действующие скидки уже сейчас — здесь: {url}",
        aboutShop: "Об истории магазина лучше расскажет менеджер — я передал ему вопрос. Отзывы покупателей — внизу страницы каждого товара.",
        packaging: "Об упаковке, коробке и документах к покупке точно скажет менеджер — я передал ему вопрос, он ответит здесь.",
        specs: "Таких подробностей в карточке товара нет — точно скажет менеджер, я передал ему вопрос. Всё, что известно, — на странице товара.",
        weekend: "Да, работаем {hours} — без выходных. Бот отвечает круглосуточно 🙂"
    }
};

const T11 = {
    uk: { compare: "Обидва бренди — оригінал, тож вибір за смаком 🙂 Ось по дві моделі {a} і {b}, щоб порівняти 👇", noStyle: "{What} зараз немає 😔 Ось інші {others}, які можуть підійти 👇" },
    en: { compare: "Both brands are authentic, so it's a matter of taste 🙂 Here are two {a} and two {b} models to compare 👇", noStyle: "{What} aren't available right now 😔 Here are other {others} that might suit you 👇" },
    ru: { compare: "Оба бренда — оригинал, так что выбор по вкусу 🙂 Вот по две модели {a} и {b}, чтобы сравнить 👇", noStyle: "{What} сейчас нет 😔 Вот другие {others}, которые могут подойти 👇" }
};

// ── Стан замовлення в чаті ─────────────────────────────────────────

// Окреме число, а не шматок довшого: у «1234567890123456789» раніше
// знаходився «телефон 0123456789», і бот ішов перевіряти замовлення.
const PHONE_RE = /(?<![\d+])(?:\+?38\s?)?\(?0\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/;

// Номер замовлення й телефон з одного повідомлення. Номер — 6–12 цифр,
// що НЕ є частиною телефону й не починаються з нуля (телефон — з нуля).
export function extractLookup(text) {
    const raw = String(text || "");
    const phoneMatch = raw.match(PHONE_RE);
    if (!phoneMatch) return null;
    const rest = raw.replace(phoneMatch[0], " ");
    const order = (rest.match(/(?:^|\D)([1-9]\d{5,11})(?!\d)/) || [])[1];
    if (!order) return null;
    return { orderNumber: order, phone: phoneMatch[0].replace(/[^\d+]/g, "") };
}

// Стан — тими самими словами, що на сторінці «Де моє замовлення»
// (order-lookup.js, LOOKUP_STATUS); англійською й російською — переклад.
const STATUS_TEXT = {
    en: {
        new: ["Awaiting processing", "We've received the order and will contact you to confirm the details."],
        processing: ["Being prepared for shipping", "The order has been accepted and is being packed."],
        shipped: ["Handed over for delivery", "The order is on its way. You can track it by the waybill number."],
        completed: ["Delivered", "The order is completed. Thank you for your purchase!"],
        cancelled: ["Cancelled", "The order has been cancelled. If this is a mistake, write to us and we'll fix it."]
    },
    ru: {
        new: ["Ожидает обработки", "Заказ получен. Мы свяжемся с вами, чтобы подтвердить детали."],
        processing: ["Готовится к отправке", "Заказ принят в работу и упаковывается."],
        shipped: ["Передан в доставку", "Заказ в пути. Отследить его можно по номеру накладной."],
        completed: ["Доставлен", "Заказ выполнен. Спасибо за покупку!"],
        cancelled: ["Отменен", "Заказ отменен. Если это ошибка — напишите нам, мы все исправим."]
    }
};

const T12 = {
    uk: { head: "Замовлення {number}: {label}.", ttn: "Номер накладної: {ttn}", notFound: "Не знайшов замовлення з таким номером і телефоном 🤔 Перевірте цифри (номер — на сторінці підтвердження й у листі про замовлення, телефон — той, що вказували при оформленні) або напишіть, і менеджер подивиться." },
    en: { head: "Order {number}: {label}.", ttn: "Waybill number: {ttn}", notFound: "I couldn't find an order with that number and phone 🤔 Please check the digits (the number is on the confirmation page and in the order email, the phone is the one you entered at checkout) or write here and a manager will look into it." },
    ru: { head: "Заказ {number}: {label}.", ttn: "Номер накладной: {ttn}", notFound: "Не нашел заказ с таким номером и телефоном 🤔 Проверьте цифры (номер — на странице подтверждения и в письме о заказе, телефон — тот, что указывали при оформлении) или напишите, и менеджер посмотрит." }
};

// view — publicOrderView (order-lookup.js) або null, якщо не знайдено.
export function lookupReplyText(view, lang) {
    const l = botLang(lang);
    if (!view) return T12[l].notFound;
    const tr = l !== "uk" && STATUS_TEXT[l][view.status];
    const label = tr ? tr[0] : view.status_label;
    const note = tr ? tr[1] : view.status_note;
    const lines = [fill(T12[l].head, { number: view.order_number, label }), note];
    if (view.tracking_number) lines.push(fill(T12[l].ttn, { ttn: view.tracking_number }));
    return lines.join("\n");
}

const T13 = {
    uk: { which: "Про яку з них? Напишіть номер — «перша», «друга»… — або натисніть нижче.", ordinals: ["Розкажіть про першу", "Розкажіть про другу", "Розкажіть про третю", "Розкажіть про четверту"] },
    en: { which: "Which one? Write its number — “first”, “second”… — or tap below.", ordinals: ["Tell me about the first", "Tell me about the second", "Tell me about the third", "Tell me about the fourth"] },
    ru: { which: "Про какую из них? Напишите номер — «первая», «вторая»… — или нажмите ниже.", ordinals: ["Расскажите о первой", "Расскажите о второй", "Расскажите о третьей", "Расскажите о четвертой"] }
};

const T14 = {
    uk: { discountYes: "Так, зараз знижка {pct} %: {price} замість {old}.", discountNo: "На цю річ зараз знижки немає — ціна {price}. Усі акції — тут: {url}", until: "Діє до {date}." },
    en: { discountYes: "Yes, it's {pct}% off right now: {price} instead of {old}.", discountNo: "There's no discount on this item right now — the price is {price}. All current sales: {url}", until: "Valid until {date}." },
    ru: { discountYes: "Да, сейчас скидка {pct} %: {price} вместо {old}.", discountNo: "На эту вещь сейчас скидки нет — цена {price}. Все акции — здесь: {url}", until: "Действует до {date}." }
};

// Місяці в родовому відмінку (en — назви). Для «діє до 12 листопада».
function mailMonths(lang) {
    return {
        uk: ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"],
        en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
        ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
    }[lang] || [];
}

const T15 = {
    uk: { recommend: "{what}ось що радимо зараз — хіти, новинки й знижки 👇", among: "" },
    en: { recommend: "{what}here's what we recommend right now — hot picks, new arrivals and sales 👇", among: "" },
    ru: { recommend: "{what}вот что советуем сейчас — хиты, новинки и скидки 👇", among: "" }
};

const T16 = {
    uk: {
        preorder: "Строк під замовлення в кожної речі свій — він вказаний на її сторінці (наприклад, «Під замовлення: 10–14 робочих днів»). Якщо підкажете, яка річ цікавить, — назву строк точніше.",
        reviews: "Відгуки — внизу сторінки кожного товару. Їх залишають лише ті, хто справді купував: для відгуку потрібні номер замовлення й телефон.",
        orderQ: "Звісно! Напишіть номер замовлення й телефон, указаний при оформленні, — я перевірю стан. Або опишіть питання, і менеджер допоможе."
    },
    en: {
        preorder: "Each made-to-order item has its own lead time — it's shown on its page (e.g. “Made to order: 10–14 business days”). Tell me which item you're interested in and I'll give you the exact time.",
        reviews: "Reviews are at the bottom of each product page. Only real buyers can leave them: a review needs the order number and phone.",
        orderQ: "Of course! Send the order number and the phone you used at checkout — I'll check the status. Or describe the question and a manager will help."
    },
    ru: {
        preorder: "Срок под заказ у каждой вещи свой — он указан на ее странице (например, «Под заказ: 10–14 рабочих дней»). Если подскажете, какая вещь интересует, — назову срок точнее.",
        reviews: "Отзывы — внизу страницы каждого товара. Их оставляют только те, кто действительно покупал: для отзыва нужны номер заказа и телефон.",
        orderQ: "Конечно! Напишите номер заказа и телефон, указанный при оформлении, — я проверю состояние. Или опишите вопрос, и менеджер поможет."
    }
};

// Бренди, яких немає в каталозі, стать, якої немає в розділі, перелік брендів.
const T18 = {
    uk: {
        other: "{brand} у нас зараз немає 😔 Привезти під замовлення можна через байєр-сервіс — я передав питання менеджеру: {url}\nУ наявності зараз: {list}.",
        otherTyped: "{brand} у нас зараз немає 😔 Ось {desc} інших брендів 👇 А привезти саме {brand} можна через байєр-сервіс — я передав питання менеджеру: {url}",
        noGender: "{Type} зараз є лише {others} — {gen} немає 😔 Привезти під замовлення можна через байєр-сервіс — я передав питання менеджеру: {url}",
        brands: "У наявності зараз такі бренди: {list}. Напишіть бренд — покажу, що є 👇",
        prepay: "Передоплата не обовʼязкова: можна оплатити карткою онлайн або при отриманні в Новій пошті. Передоплата потрібна лише для замовлень через байєр-сервіс.",
        cod: "Так, можна оплатити при отриманні — у відділенні Нової пошти. Або карткою онлайн при оформленні."
    },
    en: {
        other: "We don't have {brand} right now 😔 We can bring it to order through our buyer service — I've passed your question to a manager: {url}\nIn stock now: {list}.",
        otherTyped: "We don't have {brand} right now 😔 Here are {desc} from other brands 👇 To get {brand} specifically, we can order it through our buyer service — I've passed your question to a manager: {url}",
        noGender: "Right now we only have {others} {type} — no {gen} 😔 We can order them through our buyer service — I've passed your question to a manager: {url}",
        brands: "Brands in stock right now: {list}. Write a brand and I'll show what we have 👇",
        prepay: "No prepayment is required: you can pay by card online or on delivery at a Nova Poshta branch. Prepayment is needed only for buyer-service orders.",
        cod: "Yes, you can pay on delivery — at the Nova Poshta branch. Or by card online when ordering."
    },
    ru: {
        other: "{brand} у нас сейчас нет 😔 Привезти под заказ можно через байер-сервис — я передал вопрос менеджеру: {url}\nВ наличии сейчас: {list}.",
        otherTyped: "{brand} у нас сейчас нет 😔 Вот {desc} других брендов 👇 А привезти именно {brand} можно через байер-сервис — я передал вопрос менеджеру: {url}",
        noGender: "{Type} сейчас есть только {others} — {gen} нет 😔 Привезти под заказ можно через байер-сервис — я передал вопрос менеджеру: {url}",
        brands: "В наличии сейчас такие бренды: {list}. Напишите бренд — покажу, что есть 👇",
        prepay: "Предоплата не обязательна: можно оплатить картой онлайн или при получении в Новой почте. Предоплата нужна только для заказов через байер-сервис.",
        cod: "Да, можно оплатить при получении — в отделении Новой почты. Или картой онлайн при оформлении."
    }
};

// «Чоловічих кросівок» — стать і тип у родовому (після «немає»).
const GENDER_WORDS = {
    nom: { "Чоловікам": { uk: "чоловічі", en: "men's", ru: "мужские" }, "Жінкам": { uk: "жіночі", en: "women's", ru: "женские" } },
    gen: { "Чоловікам": { uk: "чоловічих", en: "men's", ru: "мужских" }, "Жінкам": { uk: "жіночих", en: "women's", ru: "женских" } }
};

// Відомі бренди, яких у каталозі може не бути. Перевіряємо лише ті, що
// справді відсутні в довідці: зʼявиться Guess у каталозі — бот покаже його.
// Короткі й багатозначні слова — лише цілим словом ($): «найк» інакше
// ловив би «найкращий», «зара» — «зараз».
const OTHER_BRANDS = [
    ["Louis Vuitton", ["louis vuitton", "vuitton", "луї віттон", "луі віттон", "луї вітон", "луи виттон", "луи витон", "віттон", "виттон", "lv$"]],
    ["Chanel", ["chanel", "шанель", "шанел$"]],
    ["Guess", ["guess$", "гесс$", "гес$", "гесс"]],
    ["Dior", ["dior", "діор", "диор"]],
    ["Hermès", ["hermes", "hermès", "гермес", "ермес"]],
    ["Versace", ["versace", "версаче"]],
    ["Fendi", ["fendi", "фенді", "фенди"]],
    ["Furla", ["furla", "фурла"]],
    ["Calvin Klein", ["calvin klein", "кельвін кляйн", "кельвин кляйн", "кельвін клейн", "кельвин кляйн"]],
    ["Tommy Hilfiger", ["tommy hilfiger", "hilfiger", "хілфігер", "хилфигер"]],
    ["Kate Spade", ["kate spade", "кейт спейд"]],
    ["Valentino", ["valentino", "валентино"]],
    ["Bottega Veneta", ["bottega", "боттега", "ботега"]],
    ["Givenchy", ["givenchy", "живанші", "живанши"]],
    ["Dolce & Gabbana", ["dolce", "gabbana", "дольче", "габбана"]],
    ["Celine", ["celine", "селін$", "селин$"]],
    ["Loewe", ["loewe", "лоеве", "лоеве"]],
    ["Miu Miu", ["miu miu", "міу міу", "миу миу"]],
    ["Balmain", ["balmain", "бальман"]],
    ["Ralph Lauren", ["ralph lauren", "ральф лорен"]],
    ["Hugo Boss", ["hugo boss", "хуго бос", "хьюго босс", "хуго босс"]],
    ["Rolex", ["rolex", "ролекс"]],
    ["Omega", ["omega$", "омега$"]],
    ["Casio", ["casio", "касіо", "касио"]],
    ["Fossil", ["fossil", "фосил", "фоссил"]],
    ["Longines", ["longines", "лонжин"]],
    ["Seiko", ["seiko", "сейко"]],
    ["Cartier", ["cartier", "картьє", "картье"]],
    ["Nike", ["nike$", "найк$", "найкі$", "найки$"]],
    ["New Balance", ["new balance", "нью беланс", "нью баланс"]],
    ["Puma", ["puma$", "пума$"]],
    ["Oakley", ["oakley", "оклі$", "окли$"]],
    ["Tom Ford", ["tom ford", "том форд"]],
    ["DKNY", ["dkny"]],
    ["Karl Lagerfeld", ["lagerfeld", "лагерфельд"]],
    ["Zara", ["zara$", "зара$"]]
];

export function findOtherBrand(text, data) {
    const list = words(text);
    if (/\bi guess\b/i.test(String(text || ""))) return null;
    const have = new Set((data && data.products || []).map(p => String(p.brand || "").toLowerCase()));
    const hit = OTHER_BRANDS.find(([name, stems]) => hasStem(list, stems));
    if (!hit) return null;
    const lower = hit[0].toLowerCase();
    if ([...have].some(b => b === lower || b.includes(lower))) return null;
    return hit[0];
}

// Спокійна гама: чорний, білий, бежевий, сірий, коричневий, темно-синій…
const NEUTRAL_RE = /^(чорн|біл|беж|сір|коричн|темно-коричн|айвор|тауп|темно-син|темно-сір|молоч|кремов|пудров|карамел|сіро|бежево|чорно|графіт|антрацит)/;

// Світла гама: білий, бежевий, айворі, молочний, пудровий, рожевий, світлі відтінки.
const LIGHT_RE = /^(біл|беж|айвор|молоч|кремов|пудров|рожев|світло|блакит|бузк|лаванд|chalk|ivory|сіро-беж)/;

// Бренди в наявності — від найбільшого вибору.
function brandsInStock(data) {
    const counts = new Map();
    (data.products || []).forEach(p => { if (p.brand) counts.set(p.brand, (counts.get(p.brand) || 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([b]) => b);
}

// «За запитом "червоні жіночі гаманці" нічого немає — ось найближче».
// Раніше — лише «Точно такого немає», і людина не знала, чого саме.
const T19 = {
    uk: { relaxed: "За запитом «{desc}» зараз нічого немає 😔 Ось найближче — {shown}{tail} 👇", cheapest: ", від найдоступніших" },
    en: { relaxed: "Nothing for “{desc}” right now 😔 Here's the closest — {shown}{tail} 👇", cheapest: ", most affordable first" },
    ru: { relaxed: "По запросу «{desc}» сейчас ничего нет 😔 Вот ближайшее — {shown}{tail} 👇", cheapest: ", от самых доступных" }
};

const T20 = {
    uk: { one: "«{title}» коштує {price}.\n{url}", many: "Ціни — на картках вище: від {min} до {max}. Про яку розповісти?" },
    en: { one: "“{title}” costs {price}.\n{url}", many: "Prices are on the cards above: from {min} to {max}. Which one should I tell you about?" },
    ru: { one: "«{title}» стоит {price}.\n{url}", many: "Цены — на карточках выше: от {min} до {max}. О какой рассказать?" }
};

const T21 = {
    uk: {
        brandsOf: "{what}: у наявності такі бренди — {list}. Напишіть бренд — покажу 👇",
        pair: "Ось {a} і {b}{brand} — по два варіанти 👇",
        compare: "Порівняння 👇", bigger: "Найбільша з показаних — «{title}»: {dims}.\n{url}", smaller: "Найменша з показаних — «{title}»: {dims}.\n{url}",
        noDims: "У картках цих речей немає габаритів, щоб порівняти, — передаю питання менеджеру."
    },
    en: {
        brandsOf: "{what}: brands in stock — {list}. Write a brand and I'll show it 👇",
        pair: "Here are {a} and {b}{brand} — two of each 👇",
        compare: "Side by side 👇", bigger: "The biggest of these is “{title}”: {dims}.\n{url}", smaller: "The smallest of these is “{title}”: {dims}.\n{url}",
        noDims: "These items have no dimensions in their cards to compare — I'm passing your question to a manager."
    },
    ru: {
        brandsOf: "{what}: в наличии такие бренды — {list}. Напишите бренд — покажу 👇",
        pair: "Вот {a} и {b}{brand} — по два варианта 👇",
        compare: "Сравнение 👇", bigger: "Самая большая из показанных — «{title}»: {dims}.\n{url}", smaller: "Самая маленькая из показанных — «{title}»: {dims}.\n{url}",
        noDims: "В карточках этих вещей нет габаритов, чтобы сравнить, — передаю вопрос менеджеру."
    }
};

// Типи, названі в повідомленні: «сумку і гаманець в комплект».
export function typesOf(text) {
    const list = words(text);
    return [...new Set(TYPES.filter(t => hasStem(list, t.stems)).map(t => t.key))];
}

// Площа двох більших сторін із габаритів картки, см².
function bagArea(p) {
    const d = String((p.details && p.details.dimensions && p.details.dimensions.uk) || "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g);
    if (!d || d.length < 2) return 0;
    const [a, b] = d.map(Number).sort((x, y) => y - x);
    return a * b;
}

const RESERVE = ["відкладіть", "відклади", "забронюй", "забронюйте", "залиште для мене", "притримайте", "отложите", "отложи", "забронируйте", "оставьте для меня", "reserve", "hold it for me", "put it aside"];
const BUY = ["беру", "візьму", "куплю", "хочу купити", "хочу замовити", "хочу її", "хочу цю", "хочу цей", "хочу його", "замовляю", "оформлю", "возьму", "хочу купить", "хочу заказать", "заказываю", "i'll take", "i will take", "i'll buy", "i want to buy", "want to order", "i'd like to buy", "i want this", "i want it"];

const T22 = {
    uk: {
        buy: "Чудовий вибір! 🙂 «{title}» — {price}.\nЩоб оформити: відкрийте сторінку товару, натисніть «Купити», далі в кошику — «Оформити замовлення». Реєстрація не потрібна.\n{url}\nЗручніше, щоб оформив менеджер, — залиште тут номер телефону.",
        reserve: "Передаю менеджеру прохання відкласти «{title}» — він підтвердить тут же.\n{url}",
        currency: "Ціни в нас у гривнях (₴) — напишіть, будь ласка, бюджет у гривнях, наприклад «до 8000», і я підберу точніше.",
        usSize: "Розміри в каталозі — європейські (EU): {list}. Перевести US чи UK допоможе «Таблиця розмірів» на сторінці товару або менеджер.",
        phonePhotos: "Дякую! Передаю менеджеру — він надішле фото чи відео на цей номер (щодня 09:00–20:00).",
        noHalf: "Розміру {size} зараз немає — половинних розмірів у каталозі немає 😔 Є: {list}. Між двома розмірами допоможе обрати «Таблиця розмірів» на сторінці товару або менеджер."
    },
    en: {
        buy: "Great choice! 🙂 “{title}” — {price}.\nTo order: open the product page, tap “Buy”, then “Checkout” in the cart. No registration needed.\n{url}\nIf you'd rather a manager placed the order, leave your phone number here.",
        reserve: "I'm passing your request to reserve “{title}” to a manager — they will confirm right here.\n{url}",
        currency: "Our prices are in hryvnias (₴) — please write your budget in hryvnias, e.g. “under 8000”, and I'll pick more precisely.",
        usSize: "Sizes in our catalog are European (EU): {list}. The “Size chart” on the product page or a manager will help convert US or UK sizes.",
        phonePhotos: "Thank you! I'm passing this to a manager — they will send photos or a video to this number (daily 09:00–20:00, Kyiv time).",
        noHalf: "Size {size} isn't available — there are no half sizes in the catalog 😔 Available: {list}. The “Size chart” on the product page or a manager will help you choose between two sizes."
    },
    ru: {
        buy: "Отличный выбор! 🙂 «{title}» — {price}.\nЧтобы оформить: откройте страницу товара, нажмите «Купить», затем в корзине — «Оформить заказ». Регистрация не нужна.\n{url}\nУдобнее, чтобы оформил менеджер, — оставьте здесь номер телефона.",
        reserve: "Передаю менеджеру просьбу отложить «{title}» — он подтвердит здесь же.\n{url}",
        currency: "Цены у нас в гривнах (₴) — напишите, пожалуйста, бюджет в гривнах, например «до 8000», и я подберу точнее.",
        usSize: "Размеры в каталоге — европейские (EU): {list}. Перевести US или UK поможет «Таблица размеров» на странице товара или менеджер.",
        phonePhotos: "Спасибо! Передаю менеджеру — он пришлет фото или видео на этот номер (ежедневно 09:00–20:00).",
        noHalf: "Размера {size} сейчас нет — половинных размеров в каталоге нет 😔 Есть: {list}. Выбрать между двумя размерами поможет «Таблица размеров» на странице товара или менеджер."
    }
};

const T23 = {
    uk: {
        city: "Так, відправляємо Новою поштою в будь-яке місто України — у відділення, поштомат чи курʼєром. Передаємо в доставку за 1–2 робочі дні, далі Нова пошта — ще 1–3 дні.",
        whatPrice: "Підкажіть, яка річ цікавить — напишіть назву, бренд чи тип (сумка, годинник…) або надішліть посилання на товар 🙂",
        noModel: "Моделі «{model}» зараз у каталозі немає — ось {desc}, що є 👇",
        again: "Я тут 🙂 Напишіть, що шукаєте, — наприклад «чорна сумка до 8000», — або оберіть нижче."
    },
    en: {
        city: "Yes, we ship with Nova Poshta to any city in Ukraine — to a branch, a parcel locker or by courier. We hand the order over within 1–2 business days, then Nova Poshta takes another 1–3 days.",
        whatPrice: "Which item are you interested in? Write its name, brand or type (bag, watch…) or send a link to the product 🙂",
        noModel: "There's no “{model}” in the catalog right now — here are the {desc} we have 👇",
        again: "I'm here 🙂 Tell me what you're looking for — e.g. “black bag under 8000” — or choose below."
    },
    ru: {
        city: "Да, отправляем Новой почтой в любой город Украины — в отделение, почтомат или курьером. Передаем в доставку за 1–2 рабочих дня, дальше Новая почта — еще 1–3 дня.",
        whatPrice: "Подскажите, какая вещь интересует — напишите название, бренд или тип (сумка, часы…) или пришлите ссылку на товар 🙂",
        noModel: "Модели «{model}» сейчас в каталоге нет — вот {desc}, которые есть 👇",
        again: "Я здесь 🙂 Напишите, что ищете, — например «черная сумка до 8000», — или выберите ниже."
    }
};

const T24 = {
    uk: {
        face: "Підібрати оправу під форму обличчя краще з менеджером — я передав йому питання. А поки ось окуляри, щоб подивитися 👇",
        whyPreorder: "«Під замовлення» — річ, яку ми привозимо вже після вашого замовлення. Строк указано на сторінці кожної речі.",
        returning: "Раді, що повертаєтесь! 🙂 Що шукаєте цього разу?"
    },
    en: {
        face: "Choosing frames for your face shape is best done with a manager — I've passed your question on. Meanwhile, here are the sunglasses 👇",
        whyPreorder: "“To order” means we bring the item after you place the order. The lead time is on each item's page.",
        returning: "Glad to have you back! 🙂 What are you looking for this time?"
    },
    ru: {
        face: "Подобрать оправу под форму лица лучше с менеджером — я передал ему вопрос. А пока вот очки, чтобы посмотреть 👇",
        whyPreorder: "«Под заказ» — вещь, которую мы привозим уже после вашего заказа. Срок указан на странице каждой вещи.",
        returning: "Рады, что вы вернулись! 🙂 Что ищете в этот раз?"
    }
};

const T25 = {
    uk: { noList: "Я ще нічого не показував 🙂 Напишіть, що шукаєте, — підберу, і тоді розповім про будь-яку з речей." },
    en: { noList: "I haven't shown anything yet 🙂 Tell me what you're looking for — I'll pick some, and then tell you about any of them." },
    ru: { noList: "Я ещё ничего не показывал 🙂 Напишите, что ищете, — подберу, и тогда расскажу о любой из вещей." }
};

const T26 = {
    uk: { needPhone: "Дякую! Тепер напишіть, будь ласка, телефон, на який оформлювали замовлення, — і я перевірю стан.", needOrder: "Дякую! А номер замовлення? Він є на сторінці підтвердження й у листі після оформлення — 10 цифр." },
    en: { needPhone: "Thank you! Now please write the phone number used for the order — and I'll check the status.", needOrder: "Thank you! And the order number? It's on the confirmation page and in the email after checkout — 10 digits." },
    ru: { needPhone: "Спасибо! Теперь напишите, пожалуйста, телефон, на который оформляли заказ, — и я проверю статус.", needOrder: "Спасибо! А номер заказа? Он есть на странице подтверждения и в письме после оформления — 10 цифр." }
};

const T27 = {
    // Українською — без імені в звертанні: правильно «Олю», «Андрію», а
    // кличного відмінка бот не вгадає. Ім'я бачить власник у Telegram.
    uk: { only: "Приємно познайомитись! 🙂 Чим можу допомогти — підібрати річ чи розповісти про доставку й оплату?", prefix: "Приємно познайомитись! " },
    en: { only: "Nice to meet you, {name}! 🙂 How can I help — pick an item or tell you about delivery and payment?", prefix: "Nice to meet you, {name}! " },
    ru: { only: "Приятно познакомиться, {name}! 🙂 Чем могу помочь — подобрать вещь или рассказать о доставке и оплате?", prefix: "Приятно познакомиться, {name}! " }
};

const T28 = {
    uk: {
        kidsType: "Дитячих {what} зараз немає 😔 У каталозі — дорослі моделі. Подивитесь, що є?",
        catalog: "Увесь каталог — тут: {url}. Або напишіть, що шукаєте, — підберу 👇",
        langs: "Так, сайт є трьома мовами: українська — {uk}, англійська — {en}, російська — {ru}. Юридичні умови — українською.",
        currency: "Ціни на сайті — у гривнях (₴). Напишіть бюджет — наприклад «до 8000», — і я підберу."
    },
    en: {
        kidsType: "There are no children's {what} right now 😔 The catalog has adult models. Want to see them?",
        catalog: "The full catalog is here: {url}. Or tell me what you're looking for — I'll pick some 👇",
        langs: "Yes, the website is in three languages: Ukrainian — {uk}, English — {en}, Russian — {ru}. Legal terms are in Ukrainian.",
        currency: "Prices on the website are in hryvnias (₴). Tell me your budget — e.g. “under 8000” — and I'll pick something."
    },
    ru: {
        kidsType: "Детских {what} сейчас нет 😔 В каталоге — взрослые модели. Посмотрите, что есть?",
        catalog: "Весь каталог — здесь: {url}. Или напишите, что ищете, — подберу 👇",
        langs: "Да, сайт есть на трех языках: украинский — {uk}, английский — {en}, русский — {ru}. Юридические условия — на украинском.",
        currency: "Цены на сайте — в гривнах (₴). Напишите бюджет — например «до 8000», — и я подберу."
    }
};

const T29 = {
    uk: {
        choose: "Ось вони поруч, щоб легше обрати 👇 Підкажіть, що важливіше — ціна, розмір чи колір, — і я звужу. Особисто порадити може менеджер — напишіть «покличте менеджера».",
        quality: "Усі речі — оригінал з офіційних магазинів брендів, тож якість та, що в самого бренду. Діє гарантія й 14 днів на повернення: {url}",
        think: "Звісно, подумайте 🙂 Якщо будуть питання — пишіть, я тут. Відкласти річ може менеджер — напишіть «відкладіть».",
        similarTo: "Схожі на «{title}» — той самий розділ, ціна поруч 👇"
    },
    en: {
        choose: "Here they are side by side to make it easier 👇 Tell me what matters more — price, size or colour — and I'll narrow it down. For personal advice, write “call a manager”.",
        quality: "Everything is authentic, from official brand stores, so the quality is the brand's own. There's a warranty and 14 days to return: {url}",
        think: "Of course, take your time 🙂 If you have questions, write — I'm here. A manager can reserve the item — just write “reserve”.",
        similarTo: "Similar to “{title}” — same section, close in price 👇"
    },
    ru: {
        choose: "Вот они рядом, чтобы было проще выбрать 👇 Подскажите, что важнее — цена, размер или цвет, — и я сужу. Лично посоветовать может менеджер — напишите «позовите менеджера».",
        quality: "Все вещи — оригинал из официальных магазинов брендов, так что качество — как у самого бренда. Действует гарантия и 14 дней на возврат: {url}",
        think: "Конечно, подумайте 🙂 Если будут вопросы — пишите, я здесь. Отложить вещь может менеджер — напишите «отложите».",
        similarTo: "Похожие на «{title}» — тот же раздел, цена рядом 👇"
    }
};

const T30 = {
    uk: {
        sizeYes: "Так, розмір {size} є.", sizeYesPre: "Розмір {size} є під замовлення.",
        sizeNo: "Розміру {size} у цієї моделі немає — є: {list}.", sizeElsewhere: "Розмір {size} є в «{title}»: {url}",
        fitYes: "За габаритами ({dims}) {thing} має влізти. Точно — з урахуванням форми — підкаже менеджер.",
        fitNo: "За габаритами ({dims}) {thing} не влізе.",
        a4: "аркуш А4 (29,7 × 21 см)", laptop: "ноутбук 13″ (≈30,5 × 21,5 см)",
        polarYes: "Так, у картці зазначено поляризовані лінзи.",
        colorsAll: "Кольори показаних 👇"
    },
    en: {
        sizeYes: "Yes, size {size} is available.", sizeYesPre: "Size {size} is available to order.",
        sizeNo: "This model doesn't come in size {size} — available: {list}.", sizeElsewhere: "Size {size} is available in “{title}”: {url}",
        fitYes: "By its dimensions ({dims}) {thing} should fit. A manager can confirm, taking the shape into account.",
        fitNo: "By its dimensions ({dims}) {thing} won't fit.",
        a4: "an A4 sheet (29.7 × 21 cm)", laptop: "a 13″ laptop (≈30.5 × 21.5 cm)",
        polarYes: "Yes, the card says the lenses are polarized.",
        colorsAll: "Colours of the items above 👇"
    },
    ru: {
        sizeYes: "Да, размер {size} есть.", sizeYesPre: "Размер {size} есть под заказ.",
        sizeNo: "Размера {size} у этой модели нет — есть: {list}.", sizeElsewhere: "Размер {size} есть в «{title}»: {url}",
        fitYes: "По габаритам ({dims}) {thing} должен поместиться. Точно — с учетом формы — подскажет менеджер.",
        fitNo: "По габаритам ({dims}) {thing} не поместится.",
        a4: "лист А4 (29,7 × 21 см)", laptop: "ноутбук 13″ (≈30,5 × 21,5 см)",
        polarYes: "Да, в карточке указаны поляризованные линзы.",
        colorsAll: "Цвета показанных 👇"
    }
};

const T31 = {
    uk: {
        placed: "Дякуємо за замовлення! 🎉 Далі менеджер звʼяжеться з вами, щоб підтвердити замовлення й оплату (щодня 09:00–20:00). Після підтвердження відправляємо за 1–2 робочі дні, далі Нова пошта — ще 1–3 дні. Стан замовлення — тут: {url}",
        paidNoStatus: "Оплату перевіряє менеджер — я передав йому, він підтвердить тут же. Напишіть, будь ласка, номер замовлення, щоб було швидше."
    },
    en: {
        placed: "Thank you for your order! 🎉 Next, a manager will contact you to confirm the order and payment (daily 09:00–20:00, Kyiv time). After confirmation we ship within 1–2 business days, then Nova Poshta takes another 1–3 days. Order status: {url}",
        paidNoStatus: "A manager checks payments — I've passed this on, they will confirm right here. Please write your order number to speed things up."
    },
    ru: {
        placed: "Спасибо за заказ! 🎉 Дальше менеджер свяжется с вами, чтобы подтвердить заказ и оплату (ежедневно 09:00–20:00). После подтверждения отправляем за 1–2 рабочих дня, дальше Новая почта — еще 1–3 дня. Статус заказа — здесь: {url}",
        paidNoStatus: "Оплату проверяет менеджер — я передал ему, он подтвердит здесь же. Напишите, пожалуйста, номер заказа, чтобы было быстрее."
    }
};

const T17 = {
    uk: { noMore: "Це всі {desc} — {n} {variants}. Можу показати інший тип чи бренд 👇" },
    en: { noMore: "That's all the {desc} — {n} {variants}. I can show another type or brand 👇" },
    ru: { noMore: "Это все {desc} — {n} {variants}. Могу показать другой тип или бренд 👇" }
};

// Назви типів для фрази «Сумок Prada зараз немає».
// «Крім чорних» — родовий множини.
const COLOR_GEN = {
    uk: { "Чорн": "чорних", "Біл": "білих", "Коричн": "коричневих", "Беж": "бежевих", "Сір": "сірих", "Рожев": "рожевих", "Син": "синіх", "Зелен": "зелених", "Золот": "золотистих", "Срібл": "сріблястих", "Червон": "червоних" },
    en: { "Чорн": "black", "Біл": "white", "Коричн": "brown", "Беж": "beige", "Сір": "grey", "Рожев": "pink", "Син": "blue", "Зелен": "green", "Золот": "gold", "Срібл": "silver", "Червон": "red" },
    ru: { "Чорн": "черных", "Біл": "белых", "Коричн": "коричневых", "Беж": "бежевых", "Сір": "серых", "Рожев": "розовых", "Син": "синих", "Зелен": "зеленых", "Золот": "золотистых", "Срібл": "серебристых", "Червон": "красных" }
};

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
        // «Годиннник», «сууумка» — три й більше однакових букв поспіль.
        .replace(/(\p{L})\1{2,}/gu, "$1$1")
        // Суржик: «шо є по сумках?», «шось гарне».
        .replace(/(^|\s)шо(?=\s|$)/g, "$1що").replace(/(^|\s)шось(?=\s|$)/g, "$1щось")
        .trim();
}

function words(text) {
    return normalizeText(text).split(" ").filter(Boolean);
}

// Чи є в тексті слово, що ПОЧИНАЄТЬСЯ з одного зі стемів. Початок
// слова, а не будь-де: інакше «жін» знайшлося б у «піджінсах», а «чол»
// — у «чолці». Стеми з пробілом шукаються як фраза.
//
// «$» у кінці — ЦІЛЕ слово. Для коротких основ, які інакше ловлять
// чуже: «red» — «ready», «man» — «manager», «her» — «here».
function hasStem(list, stems) {
    return stems.some(stem => {
        if (stem.endsWith("$")) {
            const exact = stem.slice(0, -1);
            return exact.includes(" ") ? (" " + list.join(" ") + " ").includes(" " + exact + " ") : list.includes(exact);
        }
        return stem.includes(" ")
            ? (" " + list.join(" ") + " ").includes(" " + stem)
            : list.some(w => w.startsWith(stem));
    });
}

// Типи речей: стеми трьома мовами → категорія чи розділ каталогу.
// Розділ (department) ширший за категорію: «сумка» — це і жіночі, і
// чоловічі, а стать тоді вирішує окреме слово.
const TYPES = [
    { key: "bags", department: "Сумки", stems: ["барсетк", "портфел", "сумк", "сумоч", "сумок", "сумці", "сумочк", "клатч", "шопер", "тоут", "кросбоді", "крос-боді", "bag", "handbag", "purse", "tote", "clutch", "crossbody", "backpack", "рюкзак"] },
    { key: "watches", category: "Годинники", stems: ["годинник", "годиник", "годинік", "годинников", "часы", "часов", "часик", "watch"] },
    { key: "glasses", category: "Окуляри і оправи", stems: ["окуляр", "окулар", "очкі", "оправ", "очки", "очков", "glasses", "sunglass", "eyewear", "frames"] },
    { key: "sneakers", category: "Кросівки", stems: ["кросівк", "кроссовк", "кросовк", "крассовк", "кроссовок", "кросовок", "кросівок", "кеди", "кеды", "взутт", "обув", "sneaker", "trainer", "shoes"] },
    { key: "wallets", category: "Гаманці", stems: ["гаман", "гаманец", "кошел", "кошельок", "портмоне", "кардхолдер", "wallet", "cardholder", "card holder"] }
];

const GENDERS = [
    { key: "Жінкам", stems: ["тещ", "свекру", "бабус", "бабц", "бабуні", "дочц", "донечц", "доньк", "племінниц", "тітц", "тітоньц", "тітки", "кумі$", "хрещеній", "хрещеної", "коханій", "коханої", "кохану$", "нареченій", "нареченої", "наречену", "начальниц", "керівниц", "вчительк", "вчительц", "учительк", "учительц", "викладачк", "викладачц", "сусідці$", "колежанц", "дружин", "теще", "тёще", "тещу", "свекров", "бабушк", "бабуле", "дочер", "дочке", "дочку", "племянниц", "тете", "тёте", "тетушк", "крестной", "любимой", "любимую", "невест", "начальниц", "учительниц", "соседке$", "жене$", "grandma", "grandmother", "granny", "daughter", "niece", "aunt", "fiancee", "fiancée", "bride", "mother-in-law", "sister-in-law", "my mum", "my mom", "жін", "женщ", "женск", "жена$", "жене$", "жену$", "женой$", "жен$", "женам$", "жиноч", "жинк", "дівч", "девуш", "мам", "дружин", "жена", "жене", "сестр", "доньк", "дочк", "подруг", "подрузі", "подружці", "для подруги", "дружині", "мамі", "сестрі", "доньці", "для неї", "для нее", "woman", "women", "female", "lady", "ladies", "her$", "wife", "girl", "mom$", "mother"] },
    { key: "Чоловікам", stems: ["дідус", "дідові", "діду$", "тестю", "тестеві", "синові", "сину$", "синочк", "племінник", "дядьк", "дядькові", "куму$", "кумові", "хрещеному", "хрещеного", "коханому", "коханого", "нареченому", "нареченого", "начальнику", "керівнику", "вчителю", "вчителеві", "сусідові", "сусіду", "дедушк", "деду$", "тестю", "сыну", "сыночк", "племяннику", "дяде", "крестному", "любимому", "любимого", "жениху", "начальнику", "учителю", "соседу", "grandpa", "grandfather", "son$", "my son", "nephew", "uncle", "fiance$", "groom", "father-in-law", "brother-in-law", "барсетк", "чолов", "мужч", "мужск", "хлопц", "хлопець", "хлопчик", "парн", "парен", "тато", "тата", "татові", "татов", "папа", "папе", "папы", "папі", "муж", "сина", "сину", "синові", "синов", "сын", "брат$", "брата$", "брату$", "братом$", "другу$", "другові", "для друга", "чоловікові", "татові", "братові", "синові", "мужу", "для нього", "для него", "man$", "men$", "men's", "mens$", "male", "him$", "husband", "boyfriend", "dad$", "father", "guy$", "guys$"] }
];

// Кольори: стеми → початок української назви кольору у варіантах.
const COLORS = [
    { key: "Чорн", stems: ["чорн", "черн", "black"] },
    { key: "Біл", stems: ["білий", "біла", "біле", "білі", "білого", "білу", "білій", "белый", "белая", "белое", "белые", "белого", "белую", "white", "молочн", "айвор", "ivory"] },
    { key: "Коричн", stems: ["коричн", "brown", "кемел", "camel", "карамел"] },
    { key: "Беж", stems: ["беж", "beige", "nude"] },
    { key: "Сір", stems: ["сірий", "сіра", "сіре", "сірі", "сірого", "сіру", "серый", "серая", "серое", "серые", "серого", "серую", "grey", "gray", "графіт"] },
    { key: "Рожев", stems: ["рожев", "розов", "pink", "пудров"] },
    { key: "Син", stems: ["синій", "синя", "синь", "синий", "синяя", "blue", "navy"] },
    { key: "Зелен", stems: ["зелен", "green", "хакі", "хаки", "khaki"] },
    { key: "Золот", stems: ["золот", "gold"] },
    { key: "Срібл", stems: ["срібл", "серебр", "silver"] },
    { key: "Червон", stems: ["червон", "красн", "red$"] }
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

    // «Тисяч 8-10», «тыс 8–10» — одиниця перед числами.
    const before = t.match(/(?:тисяч|тисячі|тис|тысяч|тыс)\s*(\d+)\s*(?:-|–|—|до)\s*(\d+)(?!\d)/);
    if (before && Number(before[1]) < Number(before[2]) && Number(before[2]) < 1000) return { min: Number(before[1]) * 1000, max: Number(before[2]) * 1000 };
    const range = t.match(new RegExp(`${unit}\\s*(?:-|–|—|до|to)\\s*${unit}`));
    if (range && /^\d/.test(range[1]) && !/^(до|to)\b/.test(t.slice(range.index - 3, range.index).trim())) {
        let a = num(range[1]);
        const b = num(range[2]);
        // «10-12 тисяч»: одиниця лише біля другого числа, але стосується обох.
        if (a && b && b >= 1000 && a < 100 && !/тис|тыс|k|к/.test(range[1])) a = Math.round(a * 1000);
        if (a && b && b > a && b >= 500) return { min: a, max: b };
    }

    const max = t.match(new RegExp(`(?:^|\\s)(?:до|до\\s+ціни|не дорожче|не дороже|дешевше|дешевле|в межах|у межах|в пределах|приблизно|десь|около|примерно|no more than|not more than|not over|at most|under|below|up to|max|less than|within|around|about)\\s*${unit}`));
    // «Не дорожче 6 тис» — стеля; «дорожче» тут не нижня межа.
    const min = t.match(new RegExp(`(?:^|\\s)(?<!не\\s)(?<!no\\s)(?<!not\\s)(?:від|от|from|over|above|more than|дорожче|дороже)\\s*${unit}`));

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

// ── Фасон сумки ───────────────────────────────────────────────────

const STYLES = [
    { key: "crossbody", stems: ["крос-боді", "кросбоді", "кросс-боди", "кроссбоди", "через плече", "через плечо", "crossbody", "cross-body"], re: /crossbody|cross-body|крос-боді|кросбоді/i, name: { uk: "сумки крос-боді", en: "crossbody bags", ru: "сумки кросс-боди" }, none: { uk: "сумок крос-боді", ru: "сумок кросс-боди" } },
    { key: "tote", stems: ["шопер", "тоут", "tote", "shopper", "велика сумка", "большая сумка", "на пляж", "пляжн", "beach"], re: /tote|shopper|шопер/i, name: { uk: "шопери", en: "totes", ru: "шоперы" }, none: { uk: "шоперів", ru: "шоперов" } },
    { key: "clutch", stems: ["клатч", "clutch", "на весілля", "на свадьбу", "for a wedding", "на вечірку", "на вечеринку", "вечірн", "вечерн", "evening bag", "for a party"], re: /clutch|клатч/i, name: { uk: "клатчі", en: "clutches", ru: "клатчи" }, none: { uk: "клатчів", ru: "клатчей" } },
    { key: "mini", stems: ["міні", "маленьк", "невелик", "не дуже велик", "не надто велик", "компактн", "небольш", "не очень больш", "compact", "not too big", "мини", "маленьк", "mini$", "small bag", "tiny"], re: /mini|міні|small|маленьк/i, name: { uk: "маленькі сумки", en: "small bags", ru: "маленькие сумки" }, none: { uk: "маленьких сумок", ru: "маленьких сумок" } },
    { key: "shoulder", stems: ["на плече", "на плечо", "shoulder bag"], re: /shoulder|на плече/i, name: { uk: "сумки на плече", en: "shoulder bags", ru: "сумки на плечо" }, none: { uk: "сумок на плече", ru: "сумок на плечо" } },
    { key: "chain", stems: ["на ланцюж", "ланцюжк", "на цепоч", "цепочк", "chain"], re: /chain|ланцюж/i, name: { uk: "сумки на ланцюжку", en: "chain bags", ru: "сумки на цепочке" }, none: { uk: "сумок на ланцюжку", ru: "сумок на цепочке" } },
    { key: "belt", stems: ["бананк", "поясн сумк", "поясна", "поясная", "belt bag", "fanny", "waist bag"], re: /belt bag|поясн|бананк|racer/i, name: { uk: "поясні сумки", en: "belt bags", ru: "поясные сумки" }, none: { uk: "поясних сумок", ru: "поясных сумок" } },
    { key: "bucket", stems: ["сумка-мішок", "мішок", "мешок", "bucket"], re: /bucket|мішок/i, name: { uk: "сумки-мішки", en: "bucket bags", ru: "сумки-мешки" }, none: { uk: "сумок-мішків", ru: "сумок-мешков" } },
    { key: "envelope", stems: ["конверт", "сумка-конверт", "сумку-конверт", "клатч-конверт", "envelope"], re: /envelope|конверт/i, name: { uk: "сумки-конверти", en: "envelope bags", ru: "сумки-конверты" }, none: { uk: "сумок-конвертів", ru: "сумок-конвертов" } },
    { key: "backpack", stems: ["рюкзак", "backpack"], re: /backpack|рюкзак/i, name: { uk: "рюкзаки", en: "backpacks", ru: "рюкзаки" }, none: { uk: "рюкзаків", ru: "рюкзаков" } },
    // «З камінням», «зі стразами»: pavé і кристали з картки. Тип — з розмови.
    { key: "stones", anyType: true, stems: ["камін", "камен", "камн", "страз", "кристал", "pave", "pavé", "crystals", "rhinestone", "diamond"], re: /pav[eé]|кристал|страз/i, name: { uk: "моделі з кристалами", en: "models with crystals", ru: "модели с кристаллами" }, none: { uk: "моделей з кристалами", ru: "моделей с кристаллами" } },
    { key: "auto", type: "watches", stems: ["автоматичн", "автоматическ", "автопідзавод", "автоподзавод", "механічн", "механическ", "automatic", "self-winding", "swissmatic"], re: /automatic|swissmatic|автомат/i, name: { uk: "автоматичні годинники", en: "automatic watches", ru: "автоматические часы" }, none: { uk: "автоматичних годинників", ru: "автоматических часов" } },
    // Поляризацію вказано не в кожній картці — назва це й каже.
    { key: "polar", type: "glasses", stems: ["поляриз", "polari"], re: /polari|поляриз/i, name: { uk: "окуляри з поляризацією (як зазначено в картці)", en: "polarized sunglasses (as stated in the card)", ru: "очки с поляризацией (как указано в карточке)" }, none: { uk: "окулярів, де в картці вказано поляризацію", ru: "очков, где в карточке указана поляризация" } },
    { key: "chrono", type: "watches", stems: ["хронограф", "chronograph", "chrono$"], re: /chronograph|хронограф/i, name: { uk: "годинники-хронографи", en: "chronographs", ru: "часы-хронографы" }, none: { uk: "хронографів", ru: "хронографов" } },
    { key: "sport", type: "watches", stems: ["спортивн", "для спорту", "для спорта", "для бігу", "бігати", "для бега", "бегать", "running", "for sport", "sporty", "sport watch", "дайвер", "diver"], re: /chronograph|diver|sport|pr 100|хронограф|дайвер/i, name: { uk: "спортивні годинники", en: "sporty watches", ru: "спортивные часы" }, none: { uk: "спортивних годинників", ru: "спортивных часов" } },
    // У каталозі лише сонцезахисні окуляри — на «для зору» чесне «немає».
    { key: "optical", type: "glasses", stems: ["для зору", "для зрения", "діоптр", "диоптр", "оправи для", "оправа для", "оправу для", "для читання", "для чтения", "optical", "prescription", "eyeglasses", "reading glasses"], re: /optical|prescription|для зору|діоптр/i, name: { uk: "окуляри для зору", en: "prescription glasses", ru: "очки для зрения" }, none: { uk: "окулярів для зору", ru: "очков для зрения" } },
    // «Щоб влазив ноутбук» — з габаритів картки: 13-дюймовий ноутбук має
    // близько 30,5 × 21,5 см, тож дві більші сторони сумки — від 31 і 22 см.
    { key: "laptop", type: "bags", stems: ["ноутбук", "ноут$", "ноута$", "портфел", "для документ", "briefcase", "макбук", "laptop", "macbook", "формат а4", "а4$", "a4$"], fit: p => {
        const d = String((p.details && p.details.dimensions && p.details.dimensions.uk) || "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g);
        if (!d || d.length < 2) return false;
        const [a, b] = d.map(Number).sort((x, y) => y - x);
        return a >= 31 && b >= 22;
    }, name: { uk: "сумки, куди влізе ноутбук 13″ (від 31 × 22 см)", en: "bags that fit a 13″ laptop (from 31 × 22 cm)", ru: "сумки, куда поместится ноутбук 13″ (от 31 × 22 см)" }, none: { uk: "сумок під ноутбук", ru: "сумок под ноутбук" } }
];

// Бренди в повідомленні — усі (для «Coach чи Michael Kors?»).
export function findBrands(text, data) {
    const raw = " " + normalizeText(text) + " ";
    const brands = [...new Set(((data && data.products) || []).map(p => p.brand).filter(Boolean))];
    return brands.filter(b => {
        const n = normalizeText(b);
        const longest = n.split(" ").sort((x, y) => y.length - x.length)[0];
        return raw.includes(" " + n + " ") || (longest.length > 4 && raw.includes(" " + longest))
            || (BRAND_ALIASES[b] || []).some(a => raw.includes(" " + a));
    });
}

// ── Назва моделі ──────────────────────────────────────────────────

// Слова з назв, що НЕ є назвою моделі: тип, стать, колір, загальне.
const MODEL_STOP = new Set(["bag", "bags", "women", "women's", "men", "men's", "mens", "ladies", "unisex", "with", "and", "the", "for",
    "dark", "black", "brown", "white", "grey", "gray", "blue", "green", "pink", "red", "gold", "silver", "beige", "multi",
    "small", "mini", "medium", "large", "top", "handle", "leather", "genuine", "quilted", "logo", "crossbody", "cross-body",
    "shoulder", "tote", "watch", "watches", "sunglasses", "glasses", "sneakers", "wallet", "rectangular", "round", "square",
    "dial", "metal", "steel", "quartz", "crystal", "textile", "canvas", "signature", "new", "classic", "style", "stylish",
    "chronograph", "automatic", "eye", "cat", "pro", "city", "rose", "love", "coach", "neo", "slim", "oversized",
    // Звичайні слова, які трапились у назвах (заміряно 09.11.2026 по
    // всьому каталогу): у розмові вони означають своє, а не модель.
    "belt", "quilting", "handbag", "plaque", "pebbled", "powder", "blush", "lace", "details", "blocked", "cement", "cotton",
    "camel", "glow", "soft", "grand", "denim", "zip", "around", "snap", "heart", "bolt", "print", "lovely", "lady", "dream",
    "two-tone", "flight", "gift", "set", "sage", "active", "elite", "strap", "camera", "frosted", "micro", "petite", "ceramic",
    "colorblock", "color-block", "checkboard", "athleisure", "ray-ban", "mathey-tissot", "mathy"]);

let modelIndex = null;
let modelIndexFor = null;

function modelWords(title) {
    return String(title || "").toLowerCase().replace(/[^a-z0-9-]+/g, " ").split(" ")
        .filter(w => w.length >= 3 && !MODEL_STOP.has(w) && !/^\d{1,3}$/.test(w));
}

// Слово → товари, у назві яких воно є. Рідкісні слова (до 4 товарів) —
// це і є назви моделей: snapshot, tabby, saffiano, gg0516s.
function buildModelIndex(data) {
    const brandWords = new Set(((data && data.products) || []).flatMap(p => normalizeText(p.brand).split(/[\s-]+/)));
    const index = new Map();
    ((data && data.products) || []).forEach(p => {
        new Set(modelWords((p.title && (p.title.en || p.title.uk)) + " " + (p.title && p.title.uk))).forEach(w => {
            if (brandWords.has(w)) return;
            if (!index.has(w)) index.set(w, new Set());
            index.get(w).add(p.slug);
        });
    });
    // До 12 товарів: «tabby» — ціла лінія Coach (кілька моделей), і
    // людина, що пише «Tabby є?», хоче побачити саме їх. Загальніші
    // слова відсіює MODEL_STOP.
    [...index].forEach(([w, set]) => { if (set.size > 12) index.delete(w); });
    return index;
}

export function findModels(text, data) {
    if (!data || !data.products) return null;
    if (modelIndexFor !== data) { modelIndex = buildModelIndex(data); modelIndexFor = data; }
    const found = new Set();
    const names = [];
    words(text).forEach(w => {
        const set = modelIndex.get(w);
        if (set) { names.push(w); set.forEach(slug => found.add(slug)); }
    });
    if (!names.length) return null;
    // Назва так, як її пишуть: «Tabby», «GG0516S».
    found.names = names.map(w => /\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1));
    return found;
}

// ── Розмір взуття ─────────────────────────────────────────────────

export function parseShoeSize(text, type) {
    const half = String(text || "").match(/(?:^|[^\d])(3[3-9]|4[0-6])[.,]5(?!\d)/);
    const t = normalizeText(text);
    if (half && (type === "sneakers" || /розмір|розмер|размер|size|eu/.test(t))) return half[1] + ".5";
    const nearSizeWord = /розмір|розмер|размер|size|eu/.test(t);
    if (!nearSizeWord && type !== "sneakers") return null;
    const m = t.match(/(?:^|\s)(3[3-9]|4[0-6])(?:[.,]5)?(?:-?(?:й|ий|ого|го|th))?(?=\s|$)/);
    return m ? m[1] : null;
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

    // «Тільки не чорну», «без коричневого», «not black» — виключення, а не
    // запит: раніше бот на «не чорну» показував саме чорні.
    const NEG = ["не", "без", "крім", "окрім", "кроме", "not", "except"];
    const negated = new Set();
    const notColors = [];
    list.forEach((w, i) => {
        if (!NEG.includes(w) || i + 1 >= list.length) return;
        const c = COLORS.find(x => hasStem([list[i + 1]], x.stems));
        if (c) { notColors.push(c.key); negated.add(i + 1); }
    });
    if (notColors.length) wish.notColors = [...new Set(notColors)];
    // «Чорна п'ятниця», «black friday» — акція, а не чорний колір.
    const BF = ["чорна п'ятниц", "чорну п'ятниц", "чорної п'ятниц", "чорна пятниц", "черная пятниц", "черную пятниц", "черной пятниц", "black friday"];
    const blackFriday = hasStem(list, BF);
    const colorList = list.filter((w, i) => !negated.has(i) && !(blackFriday && /^(чорн|черн|black)/.test(w)));
    const color = COLORS.find(c => hasStem(colorList, c.stems) && !notColors.includes(c.key));
    if (color) wish.color = color.key;

    // «До 200 доларів», «$300» — цін у валюті немає; курс бот не вигадує.
    if (/\$|€|долар|доллар|usd|євро|евро|eur\b|бакс/i.test(String(text)) && /\d/.test(String(text))) { wish.foreign = true; delete wish.budget; }
    // «Sneakers size 8 US» — розміри в каталозі європейські.
    if (/\b(us|uk)\b/i.test(String(text)) && /\b([4-9]|1[0-3])(?:[.,]5)?\b/.test(String(text))) wish.usSize = true;
    // «Бажано світле» — світла гама.
    if (hasStem(list, ["світл", "светл", "пастел", "ніжн", "нежн", "light colo", "light-colo", "pastel"])) wish.light = true;
    // «Хотіла б… для себе» — жіночий рід дієслова й «для себе» = жінці.
    if (!wish.gender && hasStem(list, ["для себе", "собі$", "себе$", "для себя", "себе"]) && hasStem(list, ["хотіла", "шукала", "мріяла", "планувала", "хотела", "искала", "мечтала", "планировала", "купила", "замовила", "заказала"])) wish.gender = "Жінкам";

    // «Без яскравого кольору», «щось спокійне» — нейтральна гама.
    if (hasStem(list, ["без яскрав", "неяскрав", "не яскрав", "спокійн", "нейтральн", "базового кольору", "базовий колір", "класичного кольору", "без ярк", "неярк", "не ярк", "спокойн", "нейтральн", "базового цвета", "neutral", "muted", "not bright", "no bright"])) wish.neutral = true;
    // «Без логотипу», «однотонна» — без фірмового принту на всю сумку.
    if (hasStem(list, ["без логотип", "без лого", "без принт", "без монограм", "однотонн", "без надпис", "no logo", "without logo", "plain", "без логотип", "без надпис"])) wish.noLogo = true;
    // «Щоб сьогодні відправили», «в наявності» — без речей під замовлення.
    if (hasStem(list, ["в наявност", "у наявност", "в наличи", "є в наявн", "in stock", "available now", "сьогодні відправ", "відправите сьогодні", "відправили сьогодні", "сегодня отправ", "отправите сегодня", "ship today"])) wish.inStock = true;

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

    // «Що порадите?», «що популярне?» — порада: хіти (позначка HOT від
    // власника), потім новинки, потім знижки. Відгуків поки немає, тож
    // «найпопулярніше» за продажами бот чесно не вигадує.
    if (hasStem(list, ["що порад", "що б ви порад", "порадьте", "порадь", "порекоменд", "що популяр", "популярн", "найпопулярн", "самое популяр", "самые популяр", "самый популяр", "most popular", "хіт", "хит", "бестселер", "бестселлер", "что посовет", "посоветуйте", "что популяр", "recommend", "suggest something", "popular", "bestseller", "best seller", "trending", "what's hot", "незвичайн", "необычн", "оригінальн дизайн", "unusual", "unique", "модн", "тренд", "trend", "в моді", "в моде", "до всього", "ко всему", "with everything", "під джинси", "до джинсів", "к джинсам", "with jeans", "що краще для", "что лучше для", "what's best for", "what is best for", "універсальн", "на кожен день", "на щодень", "повсякденн", "на каждый день", "повседневн", "универсальн", "everyday", "versatile", "for every day"])) wish.recommend = true;

    // «Найдешевші сумки», «найдорожчі годинники», «преміум».
    if (hasStem(list, ["найдешевш", "найбюджетн", "самые дешев", "самый дешев", "cheapest"])) wish.cheap = true;
    // «Бюджет невеликий», «скромний бюджет» — про ціну, а не розмір.
    const smallBudget = hasStem(list, ["бюджет невелик", "невеликий бюджет", "невеликим бюджет", "скромний бюджет", "обмежений бюджет", "бюджет небольш", "небольшой бюджет", "скромный бюджет", "small budget", "tight budget", "limited budget", "low budget"]);
    if (smallBudget) wish.cheap = true;
    if (hasStem(list, ["найдорожч", "найдорожчий", "самые дорог", "самый дорог", "most expensive", "преміум", "премиум", "premium"])) wish.pricey = true;

    // Матеріал: «шкіряна», «з натуральної шкіри» — справжня шкіра;
    // «веганська», «екошкіра» — штучна. Порядок важливий: «екошкіра»
    // містить «шкір».
    if (hasStem(list, ["веган", "екошкір", "еко-шкір", "екошкіра", "штучн", "экокож", "эко-кож", "искусствен", "vegan", "faux", "pu$"])) wish.material = "vegan";
    else if (hasStem(list, ["шкір", "натуральн шкір", "кожан", "кожа$", "кожи$", "из кожи", "leather"])) wish.material = "leather";

    // Годинник: «з металевим браслетом», «на сталевому браслеті».
    if (hasStem(list, ["металев", "метал$", "сталев", "сталь", "браслет", "стальн", "металлическ", "steel", "metal", "bracelet"])) wish.band = "metal";

    // Фасон сумки — зі слів людини, у назвах і ключових словах товарів.
    const style = STYLES.find(st => st.key === "laptop" && hasStem(list, st.stems)) || STYLES.find(st => hasStem(list, st.stems) && !(smallBudget && st.key === "mini"));
    if (style) wish.style = style.key;
    if (wish.style === "clutch" && wish.type && wish.type !== "bags" && !hasStem(list, ["клатч", "clutch"])) delete wish.style;

    // «А що є від Prada?», «все від Coach» — усе від бренду: тип і колір
    // попереднього запиту сюди не переносимо.
    if (hasStem(list, ["що є від", "що є у", "а що є", "усе від", "все від", "все що є", "что есть от", "что есть у", "а что есть", "все от", "anything from", "what do you have from", "everything from", "all from"])) wish.all = true;

    // «Tabby є?», «а Snapshot?», «GG0516S» — назва моделі.
    // «Сумка 8000», «годинник 12 000» — число біля типу без «до» = стеля.
    // Лише окреме число 1 000–100 000: «RB3498», «MK4968», «Tabby 26» — ні.
    if (!wish.budget && wish.type) {
        const bare = String(text || "").replace(/(\d)[\s  ,.](?=\d{3}(?!\d))/g, "$1").match(/(?:^|[\s,;:(])(\d{4,6})(?=$|[\s,;:)?!.]|\s*(?:грн|₴|uah))/i);
        const n = bare ? Number(bare[1]) : 0;
        const year = n >= 2020 && n <= 2039 && !/грн|₴|uah/i.test(String(text));
        if (!year && n >= 1000 && n <= 100000 && !(wish.size && String(n) === wish.size)) wish.budget = { max: n };
    }

    const models = findModels(text, data);
    if (models) wish.models = models;

    // «Кросівки 38 розміру», «38-й є?» — розмір взуття. Лише число з
    // тих, що бувають у взутті, і лише поруч зі словом про розмір або
    // взуття: «до 38 000» — бюджет, а не розмір.
    const size = parseShoeSize(text, wish.type);
    if (size) wish.size = size;
    // «Шопер розмір M», «size S» — розмір-літера, лише поруч зі словом «розмір».
    if (!wish.size && /розмір|розмер|размер|size/i.test(String(text))) {
        const letter = String(text).match(/(?:^|[\s(])(XXS|XS|S|M|L|XL|XXL)(?=[\s?!.,)]|$)/);
        if (letter) wish.size = letter[1];
    }

    if (hasStem(list, ["подар", "gift", "present"])) wish.gift = true;
    if (hasStem(list, ["новинк", "новинок", "що нового", "что нового", "нового$", "нове надходж", "нові надходж", "новые поступ", "нове$", "новое", "новые", "new arrival", "latest", "what's new"])) wish.fresh = true;
    if (hasStem(list, ["знижк", "скидк", "акці", "акци", "розпродаж", "распродаж", "уцінк", "уценк", "sale", "discount", "clearance"])) wish.sale = true;

    // «Інші варіанти» — показати наступні.
    if (hasStem(list, ["інші варіант", "ще варіант", "другие вариант", "еще вариант", "other option", "more option", "show more", "покажи ще", "покажіть ще", "більше варіант", "больше вариант", "покажіть більше", "покажи більше", "покажите больше", "покажи больше", "ще покажіть", "еще покажите", "more options", "more variants", "покажи еще", "покажите еще"]) || (list.length <= 2 && (list.includes("ще") || list.includes("еще") || list.includes("more")))) wish.more = true;

    const wants = hasStem(list, ["гарненьк", "щось гарн", "щось красив", "щось стильн", "мені б", "мне бы", "что-то красив", "что-нибудь красив", "something nice", "something pretty", "шука", "ищу", "хочу", "хоті", "хотел", "підбер", "подбер", "підібр", "подобр", "порад", "посовет", "покаж", "что есть", "що є", "є ", "есть ", "looking", "want", "need", "recommend", "suggest", "show", "pick", "any "]);

    const criteria = ["type", "gender", "color", "brand", "budget", "models", "size", "material", "style", "band", "notColors", "neutral", "noLogo", "light"].filter(k => wish[k]).length;
    if (wish.band && !wish.type) wish.type = "watches";
    // Фасон чи матеріал без типу — це про сумки (інших шкіряних
    // крос-боді в каталозі немає).
    const st0 = STYLES.find(x => x.key === wish.style) || {};
    if ((wish.style || wish.material === "vegan") && !wish.type && !st0.anyType) wish.type = st0.type || "bags";

    if (!criteria && !wish.gift && !wish.fresh && !wish.sale && !wish.more && !wish.cheap && !wish.pricey && !wish.recommend && !wants) return null;

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

    if (wish.models && !wish.models.has(product.slug)) return false;

    if (wish.band === "metal") {
        const m = String((product.details && product.details.material && product.details.material.uk) || "") + " " + (product.title && product.title.en || "");
        if (!/метал|сталь|сталев|браслет|bracelet|steel/i.test(m) || /ремін|strap/i.test(m)) return false;
    }

    if (wish.material) {
        const m = String((product.details && product.details.material && product.details.material.uk) || "");
        const vegan = /веган|еко|поліуретан|штучн/i.test(m);
        if (wish.material === "vegan" && !vegan) return false;
        // «Фірмовий покритий канвас та шкіра», «жакард, шкіряне
        // оздоблення» — шкіра тут лише в деталях. На «з натуральної шкіри»
        // людина чекає шкіряну сумку.
        const notMain = /^(фірмов|монограмн|денім|штучне хутро|100% поліестер)/i.test(m.trim());
        if (wish.material === "leather" && (vegan || notMain || !/шкір/i.test(m))) return false;
    }

    if (wish.style) {
        const st = STYLES.find(x => x.key === wish.style);
        const hay = [product.title && product.title.uk, product.title && product.title.en, product.keywords].join(" ");
        if (st && (st.fit ? !st.fit(product) : !st.re.test(hay))) return false;
    }

    // Розмір — лише в моделях, де він узагалі є (у наявності чи під
    // замовлення: «під замовлення» видно в картці).
    if (wish.size) {
        const has = ((product.details && product.details.variants) || []).some(v => (v.sizes || []).some(x => String(x.size) === wish.size));
        if (!has) return false;
    }

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

    if (wish.sale && !relax.sale && !(botPriceNow(product, now) < (product.oldPrice || product.price) )) return false;
    if (wish.fresh && !product.isNew) return false;

    // Виключені кольори: річ відпадає, лише якщо ВСІ її кольори виключені
    // (у «Чорний / Бежевий» є бежевий варіант).
    const cols = (product.colors || []).map(c => String(c).toLowerCase());
    if (wish.notColors && wish.notColors.length && cols.length
        && cols.every(c => wish.notColors.some(n => c.startsWith(n.toLowerCase())))) return false;
    if (wish.neutral && cols.length && !cols.some(c => NEUTRAL_RE.test(c))) return false;
    if (wish.light && cols.length && !cols.some(c => LIGHT_RE.test(c))) return false;
    if (wish.noLogo) {
        const m = String((product.details && product.details.material && product.details.material.uk) || "");
        const hay = [product.title && product.title.uk, product.title && product.title.en, product.keywords].join(" ");
        if (/^(фірмов|монограмн|жакард)/i.test(m.trim()) || /signature|monogram|монограм|логотип|logo|jacquard|жакард|\bgg\b|4g/i.test(hay)) return false;
    }
    if (wish.inStock && (!product.inStock || product.preOrder)) return false;

    return true;

}

// Підбір: спершу точний; нічого — послаблюємо колір, потім стать,
// потім бюджет. Тип і бренд НЕ послаблюємо: показати годинник людині,
// яка шукала сумку, гірше, ніж чесно сказати «немає».
export function pickProducts(wish, data, now, offset) {

    const products = (data && data.products) || [];

    // «Дешевше» бюджет не послаблює: показати дорожче у відповідь на
    // «а дешевше є?» — гірше, ніж чесно сказати, що дешевшого немає.
    const steps = wish.cheap
        // і стать: чоловікові на «а дешевше?» жіночий гаманець — не відповідь.
        ? [{}, { color: true }]
        // Знижку — раніше за стать: «чоловічі годинники зі знижкою», а знижок
        // немає — краще чоловічі без знижки, ніж жіночі зі знижкою.
        : [{}, { color: true }, { color: true, budget: true }, { color: true, budget: true, sale: true }, { color: true, budget: true, sale: true, gender: true }];

    for (let i = 0; i < steps.length; i++) {
        const found = products.filter(p => matches(p, wish, now, steps[i]));
        if (!found.length) continue;
        const score = p => (p.badge === "HOT" ? 4 : 0) + (p.isNew ? 2 : 0) + (botPriceNow(p, now) < (p.oldPrice || p.price) ? 1 : 0);
        const budgetRelaxed = Boolean(steps[i].budget && wish.budget);
        found.sort((a, b) => budgetRelaxed ? botPriceNow(a, now) - botPriceNow(b, now) : wish.recommend ? (score(b) - score(a)) || (Number(b.inStock && !b.preOrder) - Number(a.inStock && !a.preOrder)) :
            wish.cheap ? botPriceNow(a, now) - botPriceNow(b, now) :
            wish.pricey ? botPriceNow(b, now) - botPriceNow(a, now) :
            (Number(b.inStock && !b.preOrder) - Number(a.inStock && !a.preOrder))
            || (wish.budget && wish.budget.max ? botPriceNow(b, now) - botPriceNow(a, now) : 0)
            || (Number(b.isNew) - Number(a.isNew))
            || botPriceNow(a, now) - botPriceNow(b, now));
        const start = offset && offset < found.length ? offset : 0;
        // Що саме довелося відпустити — лише те, що людина справді просила.
        const loosened = Object.keys(steps[i]).filter(k => wish[k]);
        return { items: found.slice(start, start + MAX_PRODUCTS), total: found.length, start, relaxed: i > 0, loosened };
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
        if (current.all) break;
        if (current.type && prev.type && prev.type !== current.type) break;
        ["type", "gender", "brand", "color", "budget", "size", "material", "style", "band", "fresh", "sale", "neutral", "noLogo", "inStock", "light"].forEach(k => {
            if (out[k] === undefined && prev[k] !== undefined) out[k] = prev[k];
        });
        if (prev.notColors) out.notColors = [...new Set((out.notColors || []).concat(prev.notColors))].filter(c => c !== out.color);
        if (out.models === undefined && prev.models && !current.type && !current.brand) out.models = prev.models;
    }

    out.criteria = ["type", "gender", "color", "brand", "budget", "models", "size", "material", "style", "band", "notColors", "neutral", "noLogo", "light"].filter(k => out[k]).length;

    return out;

}

// ── Часті питання ──────────────────────────────────────────────────

// Теми, на які людина питає найчастіше, — словами, а не номером
// питання: «скільки йде посилка» і «коли відправите» — одне й те саме.
const TOPICS = [
    { key: "delivery-cost", stems: ["скільки кошт доставк", "вартість доставк", "ціна доставк", "сколько стоит доставк", "стоимость доставк", "delivery cost", "shipping cost", "how much delivery", "how much is delivery", "how much does delivery"], faq: /Скільки коштує доставка|How much does delivery|Сколько стоит доставка/i },
    { key: "delivery-time", stems: ["як швидко", "як довго", "довго йде", "довго їде", "скільки днів", "коли відправ", "скільки йде", "скільки їде", "как долго", "долго идет", "сколько дней", "термін доставк", "строк доставк", "как быстро", "когда отправ", "сколько идет", "срок доставк", "how fast", "how quickly", "when will", "how long", "ship", "до понеділк", "до вівторк", "до середи", "до четверг", "до п'ятниц", "до суботи", "до неділі", "до понедельник", "до вторник", "до среды", "до четверг", "до пятниц", "до субботы", "до воскресень", "by monday", "by tuesday", "by wednesday", "by thursday", "by friday", "by saturday", "by sunday", "by the weekend", "скільки їхати", "скільки їде", "сколько ехать", "сколько едет", "коли прийде", "коли отрима", "на завтра", "когда придет", "когда получ", "tomorrow"], faq: /Як швидко|How quickly|How fast|Как быстро/i },
    { key: "delivery", stems: ["доставк", "нова пошт", "новой почт", "новая почт", "відправк", "отправк", "delivery", "shipping", "nova poshta", "courier", "кур'єр", "курьер", "поштомат", "почтомат"], faq: /Скільки коштує доставка|How much does delivery|Сколько стоит доставка/i },
    { key: "payment", stems: ["оплат", "оплач", "карт", "готівк", "наличн", "накладен", "післяплат", "наложен", "payment", "pay ", "card", "cash", "cod"], faq: /оплатити карткою|pay by card|pay online|оплатить картой/i },
    { key: "inspect", stems: ["оглян", "огляд", "осмотр", "посмотреть перед", "inspect", "check before", "приміря", "примiря", "примеря", "примерит", "примерять", "примерк", "примірк", "try on", "try it on"], faq: /оглянути|inspect|осмотреть/i },
    { key: "fake", always: true, stems: ["оригінал", "оригинал", "підробк", "подделк", "реплік", "реплик", "фейк", "fake", "replica", "original", "authentic", "genuine", "справжн", "настоящ", "real$"], faq: /репліки|replicas|реплики/i },
    { key: "source", stems: ["звідки", "откуда", "чому так дешев", "чому дешев", "чому такі ціни", "чому ціни", "чому у вас так дешев", "почему так дешев", "почему дешев", "почему такие цены", "почему у вас так дешев", "why so cheap", "why is it so cheap", "why are your prices", "why cheap", "where do you", "where from", "де купу", "где покупа"], faq: /Звідки ви привозите|Where do you|Откуда вы привозите/i },
    { key: "doubt", stems: ["сумнів", "сомнева", "doubt", "перевір оригін", "проверить оригин"], faq: /сумніваюся|doubt|сомневаюсь/i },
    { key: "return-cond", stems: ["бирк", "бирочк", "ярлик", "ярлык", "этикетк", "розпаков", "распаков", "unpack", "tags$", "tag$"], faq: /Що потрібно для повернення|Who pays for return|Кто оплачивает доставку при возврате/i, legal: true },
    { key: "returns", stems: ["поверн", "возврат", "вернут", "обмін", "обмен", "не підійш", "не подош", "не підходит", "не сподоба", "не подобає", "не понрав", "передума", "don't like", "do not like", "change my mind", "return", "refund", "exchange", "doesn't fit", "didn't fit"], faq: /Що робити, якщо товар не підійшов|What if the item|What to do if the item|Что делать, если товар не подош/i, legal: true },
    { key: "store", stems: ["примірочн", "примерочн", "fitting room", "знаходит", "находит", "де ви$", "где вы$", "в якому місті", "в каком городе", "where are you", "where is your store", "located", "магазин", "шоурум", "showroom", "офлайн", "offline", "адрес", "address", "самовивіз", "самовывоз", "забрат", "pickup", "pick up", "приїхат", "приехать"], faq: /фізичний магазин|physical store|физический магазин/i },
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

// Текст без назв брендів каталогу — для пошуку тем: «Armani Exchange»
// інакше ставало питанням про обмін, і до підбірки дописувалась відповідь
// про повернення.
export function withoutBrands(text, data) {
    let out = " " + String(text || "") + " ";
    for (const b of [...new Set(((data && data.products) || []).map(p => p.brand).filter(Boolean))]) {
        out = out.replace(new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
    }
    return out.trim();
}

export function findTopic(text) {
    const list = words(text);
    return TOPICS.find(t => hasStem(list, t.stems)) || null;
}

// Усі теми повідомлення, по одній на питання з сайту. «Доставка» й
// «вартість доставки» ведуть до того самого питання — двічі не беремо.
export function findTopics(text, faq) {
    const list = words(text);
    const out = [];
    const seen = new Set();
    TOPICS.forEach(t => {
        if (!hasStem(list, t.stems)) return;
        const item = (faq || []).find(fq => t.faq.test(fq.q));
        const key = item ? item.q : "legal:" + t.key;
        if (seen.has(key)) return;
        seen.add(key);
        // Де в повідомленні тема вперше згадана — щоб відповідати по черзі.
        const joined = " " + list.join(" ");
        const at = Math.min(...t.stems.map(st => { const i = joined.indexOf(" " + st.replace(/\$/, "")); return i < 0 ? Infinity : i; }));
        out.push({ topic: t, item, at });
    });
    // Загальна «доставка» поруч із точнішою темою про доставку — зайва.
    const specific = out.some(x => x.topic.key === "delivery-time" || x.topic.key === "delivery-cost");
    return out.filter(x => !(specific && x.topic.key === "delivery")).sort((a, b) => a.at - b.at);
}

// Відповідь на тему «оригінальність». На сайті це відповідь на «Чи
// продаєте ви репліки?» і починається з «Ні.» — на питання «це
// оригінал?» вона читалась би як «ні, не оригінал». Тож «Ні» лишаємо
// лише тоді, коли людина й питала про репліки чи підробки.
// Частина повідомлення, де стоїть питання саме цієї теми: «скільки
// коштує доставка | і чи можна оплатити при отриманні?» — у кожної
// відповіді свій «так/ні».
function clauseOf(topic, text) {
    const clauses = String(text || "").split(/[?;!,]|\s(?:і|й|та|и|and|а також|also)\s/i).map(c => c.trim()).filter(Boolean);
    return clauses.find(c => hasStem(words(c), topic.stems)) || String(text || "");
}

export function topicAnswer(topic, item, wholeList, lang, text) {
    const list = text ? words(clauseOf(topic, text)) : wholeList;
    // «Це оригінал чи репліка?» — теж «так, оригінал»: «Ні» на питання,
    // де першим стоїть «оригінал», читається як відмова.
    const positive = hasStem(list, ["оригінал", "оригинал", "справжн", "настоящ", "original", "authentic", "genuine", "real$"]);
    const replica = hasStem(list, ["реплік", "реплик", "підробк", "подделк", "копі", "копи", "фейк", "fake", "replica", "copy", "copies", "knock"]);
    if (topic.key === "fake" && (positive || !replica)) {
        return T4[lang].authYes;
    }
    // «Так.» / «Ні.» на початку — відповідь на питання «чи…?». На «як
    // оплатити?», «які способи оплати?» чи просто «оплата» таке «Так.»
    // безглузде: прибираємо, лишаючи суть. 10 відповідей кожною мовою
    // з сайту починаються саме так (заміряно 09.11.2026).
    const yesNoQuestion = hasStem(list, ["чи$", "можна", "можливо", "є$", "а є", "буде", "будете", "могу", "can$", "could", "do$", "does", "is$", "are$", "will$", "should", "можно", "ли$", "есть$", "будет", "будете"]);
    // Питання з «як / які / де / how / what / как…» на початку — не «так
    // чи ні», навіть якщо далі є «can» чи «можна»: «how can I pay?».
    const WH = ["як", "які", "який", "яка", "де", "коли", "куди", "скільки", "що", "чому", "навіщо", "how", "what", "which", "where", "when", "why", "как", "какие", "какой", "какая", "где", "когда", "куда", "сколько", "что", "почему", "зачем"];
    const first = list[0] === "а" || list[0] === "і" || list[0] === "и" || list[0] === "and" ? list[1] : list[0];
    // «Ви продаєте підробки?» — теж «так чи ні», хоч без «чи»: знак
    // питання й жодного «як / де / скільки» на початку.
    const asked = /\?/.test(String(text || "")) && !WH.includes(first);
    if ((!yesNoQuestion && !asked) || WH.includes(first)) {
        const stripped = item.a.replace(/^(Так|Ні|Yes|No|Да|Нет)[.,!]\s*/, "");
        if (stripped !== item.a) return stripped.charAt(0).toUpperCase() + stripped.slice(1);
    }
    return item.a;
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
    colors: ["кольор", "колір", "колор", "цвет", "цвета", "color", "colour", "чорн", "черн", "білий", "біла", "білу", "біле", "білі", "білого", "білої", "білих", "бел", "black", "white", "інш колір", "другой цвет", "other color"],
    sizes: ["розмір", "розмер", "размер", "size"],
    stock: ["наявн", "наличи", "in stock", "available", "availability", "є в ", "є?", "есть в ", "залиш", "остал", "коли отрима", "когда получ", "when will i get", "скільки чека", "сколько жда", "how long will", "how long until", "how long does it take", "how long to get"],
    price: ["ціна", "ціну", "ціни", "скільки кошту", "вартість", "цена", "цену", "сколько стоит", "стоимость", "price", "cost", "how much"],
    // «На цю сумку є знижка?» — про ціну ЦІЄЇ речі, а не пошук знижок.
    discount: ["знижк", "скидк", "акці", "акци", "розпродаж", "распродаж", "discount", "sale", "on sale"],
    material: ["матеріал", "материал", "шкір", "кожа", "кожан", "material", "leather", "з чого", "из чего", "made of", "склад", "состав"],
    polar: ["поляриз", "polari"],
    fit: ["а4$", "a4$", "формат а4", "ноутбук", "ноут$", "laptop", "macbook", "макбук", "документи влізуть", "документы влезут"],
    dimensions: ["влазить", "влізе", "вміщ", "вмещ", "помещает", "поміщає", "місткіст", "вместим", "capacity", "how much fits", "габарит", "розміри сумк", "размеры сумк", "dimension", "заввишки", "завширшки", "высот", "ширин", "how big", "влізе", "влезет", "fit"],
    strap: ["ремін", "ремен", "ременя", "ручк", "ручка", "довжин", "длин", "strap", "handle", "length"],
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
    // «Ця є?», «а вона є?» — саме «є» в короткому питанні (знак питання
    // нормалізація зрізає, тож стем «є?» його не бачить).
    if (!asked.length && list.length <= 4 && hasStem(list, ["є$", "есть$", "available$", "актуальн", "продан", "продали", "продаєт", "продается", "sold", "still available", "наявн", "наличи"])) asked.push("stock");
    // «Скільки?» саме на сторінці товару — ціна.
    if (!asked.length && list.length <= 2 && hasStem(list, ["скільки$", "сколько$", "how much"])) asked.push("price");
    // «Розкажіть про цю», «що це?» — коротко все з картки, без «не вказано».
    if (!asked.length && (/^\s*\++\s*$/.test(String(text || "")) || hasStem(list, ["інфо$", "інфа$", "инфо$", "інформацію", "деталі$", "детальн", "подробиц", "подробнее", "подробности", "info$", "details$", "more info", "розкаж", "расскаж", "tell me about", "tell me more", "more about", "детальніш", "подробн", "подробиц", "опис", "що це", "что это", "what is it", "інформац", "информац"]))) {
        const all = productAnswer("ціна наявність кольори розмір матеріал", product, data, lang, now, site);
        return all ? { text: all.text.replace(/\n[^\n]*(не вказано|isn't listed|не указано)[^\n]*$/, ""), handoff: false } : null;
    }
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
    if (wish && ((wish.type && !sameType) || (wish.brand && wish.brand !== product.brand) || wish.budget || (wish.sale && wish.type && !sameType))) return null;

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

    if (asked.includes("discount") && !asked.includes("price")) {
        const now_ = botPriceNow(product, now);
        const old = product.sale && now_ < product.price ? product.price : (product.oldPrice && product.oldPrice > now_ ? product.oldPrice : 0);
        if (old) {
            const pct = Math.round((1 - now_ / old) * 100);
            lines.push(fill(T14[lang].discountYes, { pct, price: botMoney(now_), old: botMoney(old) }));
            // Знижка зі строком — коли закінчиться, щоб не обіцяти зайвого.
            const to = product.sale && product.sale.to ? new Date(product.sale.to) : null;
            if (to && !Number.isNaN(to.getTime()) && now_ < product.price) {
                const months = mailMonths(lang);
                lines.push(fill(T14[lang].until, { date: lang === "en" ? `${months[to.getMonth()]} ${to.getDate()}` : `${to.getDate()} ${months[to.getMonth()]}` }));
            }
        } else {
            lines.push(fill(T14[lang].discountNo, { price: botMoney(now_), url: pageUrl(site, "/aktsii/", lang) }));
        }
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

    // «А розмір M є?», «38 є?» — прямо «так» чи «ні»; немає — у якій
    // моделі того ж бренду й розділу він є.
    // «А 55 є?», «M є?» без слова «розмір» — теж про розмір, якщо в товару розміри є.
    if (!asked.includes("sizes") && realSizes && words(text).length <= 4
        && /(?:^|[\s(])(XXS|XS|S|M|L|XL|XXL|3[3-9]|4[0-6]|5[0-9])(?=[\s?!.,)]|$)/i.test(String(text || ""))) {
        asked.push("sizes");
        const si = asked.indexOf("stock");
        if (si !== -1) asked.splice(si, 1);
    }
    const wantSize = asked.includes("sizes") && realSizes
        ? ((String(text || "").match(/(?:^|[\s(])(XXS|XS|S|M|L|XL|XXL|3[3-9]|4[0-6]|5[0-9])(?=[\s?!.,)]|$)/i) || [])[1] || "").toUpperCase() : "";
    if (wantSize) {
        const all = variants.flatMap(v => (v.sizes || []));
        const hit = all.find(x => String(x.size).toUpperCase() === wantSize);
        const L5 = T30[lang];
        if (hit) lines.push(fill(hit.preOrder ? L5.sizeYesPre : L5.sizeYes, { size: wantSize }));
        else {
            const have = [...new Set(all.map(x => String(x.size)))].sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b));
            lines.push(fill(L5.sizeNo, { size: wantSize, list: have.join(", ") }));
            const other = (data && data.products || []).find(p => p.slug !== product.slug && p.brand === product.brand && p.category === product.category
                && ((p.details && p.details.variants) || []).some(v => (v.sizes || []).some(x => String(x.size).toUpperCase() === wantSize)));
            if (other) lines.push(fill(L5.sizeElsewhere, { size: wantSize, title: (other.title && (other.title[lang] || other.title.uk)) || other.slug, url: pageUrl(site || "https://bestbrnd4u.com", `/p/${other.slug}/`, lang) }));
        }
    }
    if (asked.includes("sizes") && !wantSize) {
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

    if (asked.includes("polar")) {
        const hay = [product.title && product.title.uk, product.title && product.title.en, JSON.stringify(product.keywords || "")].join(" ");
        if (/polari|поляриз/i.test(hay)) lines.push(T30[lang].polarYes); else missing = true;
    }
    if (asked.includes("fit") && d.dimensions && d.dimensions.uk) {
        const nums = String(d.dimensions.uk).replace(/,/g, ".").match(/\d+(?:\.\d+)?/g);
        if (nums && nums.length >= 2) {
            const [a, b] = nums.map(Number).sort((x, y) => y - x);
            const laptop = /ноут|laptop|macbook|макбук/i.test(String(text));
            const fits = laptop ? a >= 31 && b >= 22 : a >= 30 && b >= 21.5;
            const L5 = T30[lang];
            lines.push(fill(fits ? L5.fitYes : L5.fitNo, { dims: d.dimensions[lang] || d.dimensions.uk, thing: laptop ? L5.laptop : L5.a4 }));
        }
    }
    if (asked.includes("dimensions") && !asked.includes("sizes") && !asked.includes("fit")) {
        if (d.dimensions && d.dimensions[lang]) lines.push(fill(L.dimensions, { value: d.dimensions[lang] }));
        else missing = true;
    }

    if (asked.includes("strap")) {
        if (d.strap && d.strap[lang]) lines.push(fill(L.strap, { value: d.strap[lang] }));
        else missing = true;
    }

    if (asked.includes("authentic")) {
        lines.push(fill(L.authentic, { url: pageUrl(site, "/authenticity", lang) }));
    }

    // Нічого з питаного в картці немає — чесно, і людині.
    if (lines.length === 1) {
        return { text: L.noInfo, handoff: true, pause: false };
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
// Мова, якою людина ПИШЕ. На українській сторінці часто пишуть
// російською, іноді англійською — відповідати їй українською означає
// говорити повз. Лише за однозначними ознаками: «ы э ъ», суто російські
// слова; для англійської — службові слова («the», «do you», «i want»),
// бо сама назва бренду латиницею («Coach») — ще не англійська.
// «Покажите больше вариантов» — без жодного з цих слів визначалось як укр.
const RU_WORDS = ["покажите", "больше", "меньше", "вариантов", "варианты", "дешевле", "дороже", "нужна", "нужен", "ищу", "кошелёк", "черный", "черные", "белый", "красная", "синяя", "мужской", "женский", "мужу", "жене", "что", "как", "это", "есть", "нужно", "сколько", "где", "какие", "какой", "какая", "можно", "хочу купить", "подскажите", "здравствуйте", "спасибо", "пожалуйста", "привет", "часы", "очки", "кроссовки", "кошелек", "женская", "мужская", "женские", "мужские", "черная", "черную", "белую", "белая", "или", "еще", "уже", "нет", "да", "мне", "вас", "у вас", "доставка в", "оплата при"];
const UK_WORDS = ["що", "як", "це", "є", "скільки", "де", "які", "який", "яка", "можна", "підкажіть", "вітаю", "дякую", "будь ласка", "привіт", "годинник", "окуляри", "кросівки", "гаманець", "жіноча", "чоловіча", "чорна", "чорну", "біла", "білу", "або", "ще", "вже", "ні", "так", "мені", "вас", "у вас"];
const EN_WORDS = ["the", "do you", "i want", "i need", "i'm", "looking for", "how much", "is it", "are you", "can i", "have you", "what", "where", "when", "please", "thanks", "thank you", "hello", "hi", "for", "with", "and", "a", "an", "my", "your", "do", "have", "is", "are", "any"];

// prevLang — мова, якою людина писала досі. Кнопка «Покликати менеджера»,
// «Women's bags», «Coach» самі мови не видають: раніше тоді бралась мова
// СТОРІНКИ, і розмова українською на /ru/ від натиску кнопки ставала
// російською.
export function detectLang(text, pageLang, prevLang) {
    const page = prevLang ? botLang(prevLang) : botLang(pageLang);
    const raw = String(text || "").toLowerCase();
    const list = words(text);
    if (!list.length) return page;
    const cyr = /[а-яіїєґё]/.test(raw);
    const ukLetters = /[іїєґ]/.test(raw);
    const ruLetters = /[ыэъё]/.test(raw);
    const count = stems => stems.filter(w => w.includes(" ") ? (" " + list.join(" ") + " ").includes(" " + w + " ") : list.includes(w)).length;
    if (cyr) {
        if (ruLetters && !ukLetters) return "ru";
        if (ukLetters && !ruLetters) return "uk";
        const ru = count(RU_WORDS), uk = count(UK_WORDS);
        if (ru > uk) return "ru";
        if (uk > ru) return "uk";
        return page === "en" ? (botLang(pageLang) === "en" ? "uk" : botLang(pageLang)) : page;
    }
    // Латиниця: англійська — лише коли є службові слова.
    return count(EN_WORDS) >= 1 && list.length >= 2 ? "en" : page;
}

// Латиниця → кирилиця для повідомлень транслітом («sumka chorna»).
export function untranslit(text) {
    const pairs = [["shch", "щ"], ["zh", "ж"], ["kh", "х"], ["ts", "ц"], ["ch", "ч"], ["sh", "ш"], ["ya", "я"], ["yu", "ю"], ["ye", "є"], ["yi", "ї"], ["ia", "я"], ["iu", "ю"], ["ie", "є"],
        ["a", "а"], ["b", "б"], ["v", "в"], ["h", "г"], ["g", "г"], ["d", "д"], ["e", "е"], ["z", "з"], ["y", "и"], ["i", "і"], ["j", "й"], ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"], ["f", "ф"], ["c", "к"], ["w", "в"], ["x", "кс"], ["q", "к"]];
    let out = String(text || "").toLowerCase();
    for (const [a, b] of pairs) out = out.split(a).join(b);
    return out;
}

// «Мене звати Оля», «я Андрій», «меня зовут Марина», «my name is Kate».
// Ім'я — з великої літери й не слово, яке бот і так розуміє (тип, місто,
// привітання): «я Київ» чи «I am Looking» іменами не стануть.
const NOT_NAMES = ["привіт", "вітаю", "дякую", "шукаю", "хочу", "можна", "добрий", "доброго", "здравствуйте", "привет", "спасибо", "ищу", "хочу", "можно", "добрый", "україни", "україна", "киев", "київ", "клієнт", "клиент", "покупець", "покупатель", "тут", "знову", "снова", "looking", "interested", "here", "back", "from", "not", "just", "sorry", "fine", "ok", "okay"];
export function introOf(text) {
    const raw = String(text || "");
    const m = raw.match(/(?:^|[\s,.!])(?:мене звати|моє ім'я|моє імʼя|меня зовут|моё имя|мое имя)\s+([А-ЯІЇЄҐA-Z][а-яіїєґё'ʼa-z]{1,14})/u)
        || raw.match(/(?:^|[,.!]\s*|^(?:привіт|вітаю|добрий день|доброго дня|привет|здравствуйте|добрый день)[,!]?\s+)(?:я|це|это)\s*[—-]?\s+([А-ЯІЇЄҐ][а-яіїєґё'ʼ]{1,14})(?=[\s,.!?]|$)/u)
        || raw.match(/(?:^|[\s,.!])(?:[Mm]y name is|I am|I'm|i am|i'm|[Tt]his is)\s+([A-Z][a-z]{1,14})\b/);
    if (!m) return null;
    const name = m[1];
    if (NOT_NAMES.includes(name.toLowerCase())) return null;
    const rest = (raw.slice(0, m.index) + " " + raw.slice(m.index + m[0].length)).replace(/^[\s,.!—-]+|[\s,—-]+$/g, "").trim();
    return { name, rest };
}

export function botReply(message, history, data, options) {
    // Представились — ім'я для власника; решта повідомлення — звичайний запит.
    {
        const intro = introOf(message);
        if (intro) {
            const optsI = options || {};
            const langI = detectLang(intro.rest || message, optsI.lang);
            const T27L = T27[langI];
            const rest = intro.rest && words(intro.rest).filter(w => !GREETINGS.some(g => w.startsWith(g.replace(/\$$/, "")))).length ? botReply(intro.rest, history, data, options) : null;
            if (rest && rest.intent !== "unknown" && rest.intent !== "hello") {
                rest.text = fill(T27L.prefix, { name: intro.name }) + rest.text.replace(/^[^!]{1,25}! /, "");
                if (rest.summary) rest.summary = `👤 ${intro.name} · ${rest.summary}`;
                return rest;
            }
            return { text: fill(T27L.only, { name: intro.name }), products: [], chips: T[langI].chips.menu, handoff: false, pause: false, lang: langI, intent: "hello" };
        }
    }
    // Трансліт: латиниця без кирилиці, якої англійською бот не розуміє, а
    // в кирилиці — розуміє. Лишаємо й оригінал (у ньому бренд: «rayban»).
    if (/[a-z]/i.test(String(message || "")) && !/[а-яіїєґ]/i.test(String(message || ""))) {
        const w0 = parseWish(message, data);
        const tr = untranslit(message);
        const w1 = parseWish(tr, data);
        if (w1 && (w1.criteria > ((w0 && w0.criteria) || 0) || (w1.type && !(w0 && w0.type))) && !/\b(the|a|an|is|are|do|you|have|any|i|my|for|with|and|what|how)\b/i.test(String(message))) message = `${tr} ${message}`;
    }

    const opts = Object.assign({}, options || {});
    {
        const link = String(message || "").match(/\/p\/([^/\s?#]+)\/?/);
        const slug = link && (() => { try { return decodeURIComponent(link[1]); } catch (e) { return link[1]; } })();
        if (!opts.page && slug && (data && data.products || []).some(p => p.slug === slug)) {
            opts.page = `/p/${slug}/`;
            message = String(message).replace(/https?:\/\/\S+|\/p\/\S+/g, " ").trim() || "розкажіть про цю";
        }
    }
    // Мова відповіді — мова повідомлення; сторінка — запасна.
    // Мова розмови — з усіх попередніх реплік людини, від давніх до нових.
    let talkLang;
    for (const m of (history || []).filter(x => x && x.author === "visitor")) talkLang = detectLang(m.body, opts.lang, talkLang);
    const lang = detectLang(message, opts.lang, talkLang);
    const L = T[lang];
    const site = opts.siteUrl || "https://bestbrnd4u.com";
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();

    if (!data || data.enabled === false) return null;
    if (!botShouldStay(history)) return null;

    const text = String(message ?? "");
    const topicText = withoutBrands(text, data);
    const list = words(text);
    const hours = HOURS[lang];
    // Передаючи розмову вночі, кажемо, коли чекати відповіді: «відповімо
    // найближчим часом» о другій ночі — неправда.
    const late = offHours(now) ? T2[lang].offHours : "";
    // «Привіт, хочу чорну сумку» — спершу «Привіт!», потім сумки.
    const greet = greetingOf(text, lang);
    const reply = (body, extra) => {
        // lang — мова ВІДПОВІДІ (мова повідомлення), а не сторінки: її
        // бере функція, записуючи відповідь і перевіряючи замовлення.
        // handoff — сповістити власника (зі звуком); pause — бот далі мовчить.
        // Мовчить лише тоді, коли розмова справді перейшла до людини
        // (попросили людину, скарга, скасування, телефон для дзвінка). На
        // «не зрозумів» чи «немає такого» бот кличе власника, але й далі
        // відповідає: раніше він замовкав, і людина з наступним питанням
        // («а зі знижкою?») лишалась без відповіді до ранку.
        const out = Object.assign({ text: body, products: [], chips: [], handoff: false, lang }, extra);
        if (out.pause === undefined) out.pause = out.handoff;
        if (out.handoff && late && !out.text.includes(late.trim())) out.text += late;
        if (greet && out.intent !== "hello" && !out.text.startsWith(greet)) out.text = `${greet}! ${out.text}`;
        if (out.handoff) out.summary = ownerSummary(out);
        if (out.intent === "unknown") out.keys = suggestKeys(text);
        // Кнопка на ту саму тему, на яку щойно відповіли («Доставка» під
        // відповіддю про доставку), дала б ту саму відповідь удруге.
        if (out.intent === "faq" && out.chips && out.chips.length) {
            const fam = t => t && t.key.split("-")[0];
            const cur = fam(findTopic(topicText));
            if (cur) out.chips = out.chips.filter(c => fam(findTopic(c)) !== cur);
        }
        return out;
    };
    // «🔎 Шукає: чорні жіночі сумки Coach до 8 000 ₴ · 👀 Дивиться: «…»» —
    // завжди українською: це для власника, а не для покупця.
    const ownerSummary = out => {
        try {
            const visitorMsgs = (history || []).filter(m => m && m.author === "visitor").slice(-CONTEXT_MESSAGES).reverse().map(m => parseWish(m.body, data)).filter(Boolean);
            const merged = mergeWishes(parseWish(text, data) || { criteria: 0 }, visitorMsgs);
            // «Дайте знижку» — прохання, а не пошук акційних речей.
            if (merged.sale && !visitorMsgs.some(w => w.sale)) merged.sale = undefined;
            const parts = [];
            if (merged.criteria) parts.push("🔎 Шукає: " + describeWish(Object.assign({}, merged, { more: false }), "uk"));
            const slug = (productFromPage(opts.page, data) || {}).slug || out.focus || lastFocus(history);
            const p = slug && (data.products || []).find(x => x.slug === slug);
            if (p) parts.push(`👀 Дивиться: «${(p.title && p.title.uk) || p.slug}» — ${botMoney(botPriceNow(p, now))}`);
            if (lang !== "uk") parts.push(`🌐 Пише ${lang === "en" ? "англійською" : "російською"}`);
            const named = (history || []).filter(m => m && m.author === "visitor").map(m => introOf(m.body)).filter(Boolean).pop();
            if (named) parts.unshift(`👤 ${named.name}`);
            return parts.join(" · ");
        } catch (e) { return ""; }
    };

    // 0. «Ти людина?», «ви бот?» — питання ПРО бота. Перевіряємо раніше за
    // «покличте людину»: слово «людина» є в обох.
    if (!((parseWish(text, data) || {}).criteria) && hasStem(list, ABOUT_FIRST)) {
        return reply(T4[lang].aboutBot, { chips: L.chips.menu, intent: "about-bot" });
    }

    // 1б'. Номер замовлення І телефон — бот сам перевірить стан (функція
    // звертається до бази, як сторінка «Де моє замовлення», з тим самим
    // лімітом). Тут — лише позначка й запасний текст на випадок, коли
    // перевірити не вийшло.
    // Бот попросив номер і телефон — людина часто шле їх по черзі:
    // «8689484479», потім «0671234567». Раніше перше давало ту саму
    // підказку вдруге, а телефон — «менеджер передзвонить».
    const prevVisitorL = (history || []).filter(m => m && m.author === "visitor").slice(-1)[0];
    // Дві останні репліки бота: «напишіть телефон» іде вже після посилання.
    const askedLookup = (history || []).filter(m => m && m.author === BOT_AUTHOR).slice(-2).some(m => /order-status/.test(String(m.body || "")));
    let lookup = extractLookup(text);
    if (!lookup && prevVisitorL && askedLookup) lookup = extractLookup(prevVisitorL.body + " " + text);
    const onlyOrder = /^\D{0,25}[1-9]\d{7,11}\D{0,3}$/.test(String(text).trim()) && !PHONE_RE.test(String(text));
    const onlyPhone = PHONE_RE.test(String(text)) && String(text).replace(PHONE_RE, "").replace(/[^\p{L}\d]/gu, "").length <= 12;
    if (!lookup && askedLookup && onlyOrder) return reply(T26[lang].needPhone, { chips: [L.chips.human], intent: "status" });
    if (!lookup && askedLookup && onlyPhone) return reply(T26[lang].needOrder, { chips: [L.chips.human], intent: "status" });
    if (lookup) {
        return reply(fill(L.status, { url: pageUrl(site, "/order-status", lang) }), { intent: "lookup", lookup, chips: [L.chips.human] });
    }

    // 1в. Номер телефону в повідомленні («мій номер 067…», «передзвоніть
    // 0501234567»): людина чекає дзвінка. Номер замовлення (теж 10 цифр)
    // з нуля не починається, тож їх не сплутати.
    if (/(?:^|[^\d])(?:\+?38)?0\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/.test(text)) {
        const photosAsk = hasStem(list, ["фото", "відео", "видео", "photo", "video", "вайбер", "viber", "телеграм", "telegram"]);
        return reply(photosAsk ? T22[lang].phonePhotos : T9[lang].phone, { handoff: true, intent: "handoff" });
    }

    // 1. Людина просить людину.
    if (hasStem(list, ["менеджер", "оператор", "людин", "человек", "живий", "живой", "покликат", "позват", "manager", "human", "operator", "real person", "агент", "agent", "передзвон", "перезвон", "call me", "call back"])) {
        return reply(fill(L.handoff, { hours }), { handoff: true, intent: "handoff" });
    }

    const T4L = T4[lang];
    const criteria = (parseWish(text, data) || {}).criteria;

    // 1а. Те, що бот сам не закриває: скасувати замовлення, сайт не
    // працює, скарга, доставка за кордон. Чесно кажемо, що далі людина.
    const esc = ESCALATE.find(e => hasStem(list, e.stems));
    if (esc && !(esc.key === "abroad" && criteria)) {
        return reply(T4L[esc.key], { handoff: true, pause: esc.key !== "abroad", intent: esc.key === "sorry" ? "sorry" : "handoff" });
    }

    // 1б. «Не прийшло», «де посилка» — посилання на перевірку і людина:
    // це вже не довідка, а можлива проблема.
    // Умовне «якщо замовлю… коли прийде?» — про строки доставки, а не
    // загублену посилку: замовлення ще немає.
    const future = hasStem(list, ["якщо замов", "якщо оформ", "замовлю", "оформлю", "куплю", "якщо купл", "если закаж", "если оформ", "закажу", "оформлю", "если купл", "if i order", "if i buy", "if i place", "на завтра"]);
    if (hasStem(list, LOST) && !criteria && !future) {
        return reply(fill(T4L.lost, { url: pageUrl(site, "/order-status", lang) }), { handoff: true, pause: false, intent: "status" });
    }

    // 1г. Невдоволення самим ботом — вибачитись і покликати людину.
    if (hasStem(list, ["тупий", "тупой", "дурний", "дурной", "не розумієш", "не розумієте", "не понимаешь", "не понимаете", "марний", "бесполезн", "безглузд", "stupid", "useless", "dumb", "you don't understand", "you do not understand", "не той", "не то$", "не те$"])) {
        return reply(T9[lang].sorryBot, { handoff: true, intent: "sorry" });
    }

    // 1д. Питання, які вирішує лише людина: персональна знижка, більше
    // фото, опт, поповнення. Бот каже, що далі менеджер, і що може
    // показати сам (акції).
    const PERSONAL = [
        { key: "installment", stems: ["частинами", "частями", "розстроч", "рассроч", "в кредит", "on credit", "оплата частин", "покупка частин", "installment", "pay later", "in installments"] },
        { key: "waterproof", stems: ["водонепроник", "водостійк", "волого", "водонепрониц", "водостойк", "влагостойк", "waterproof", "water resistant", "water-resistant", "можна плавати", "можно плавать"] },
        { key: "callback", stems: ["коли зателефон", "коли подзвон", "коли передзвон", "коли звʼяж", "коли зв'яж", "когда позвон", "когда перезвон", "когда свяж", "when will you call", "when will you contact", "you haven't called", "не подзвон", "не зателефон", "не передзвон", "не зв'яз", "не звʼяз", "ніхто не дзвон", "не позвонил", "не перезвонил", "не связал", "никто не звон", "nobody called", "no one called", "haven't heard"] },
        { key: "bargain", stems: ["дайте знижк", "зробіть знижк", "зробите знижк", "можна знижк", "можна зі знижк", "а знижку", "скинете", "скиньте", "скинути ціну", "торг", "поторгу", "дадите скидк", "сделаете скидк", "можно скидк", "скинете цену", "уступите", "give me a discount", "can you give a discount", "any discount for me", "negotiable", "best price"] },
        { key: "photos", stems: ["можна фото", "фото можна", "скиньте фото", "скинь фото", "надішліть фото", "фотки", "фоточк", "можно фото", "скиньте фото", "пришлите фото", "more pics", "more pictures", "can i see photos", "більше фото", "ще фото", "живі фото", "реальні фото", "відео", "больше фото", "еще фото", "живые фото", "реальные фото", "видео", "more photos", "more pictures", "real photos", "video"] },
        { key: "wholesale", stems: ["опт$", "оптом", "оптов", "дропшип", "дроп$", "wholesale", "bulk", "dropship"] },
        { key: "loyalty", need: ["знижк", "скидк", "discount", "бонус", "кешбек", "кэшбэк", "cashback", "промокод", "акці", "акци"], stems: ["постійн", "постоянн", "перше замовлен", "першого замовлен", "першу покупк", "першої покупк", "первый заказ", "первого заказ", "первую покупк", "лояльн", "накопичувальн", "накопительн", "кешбек", "кэшбэк", "cashback", "loyalty", "first order", "first purchase", "regular customer", "returning customer", "студент", "пенсіонер", "пенсионер", "військов", "военн", "student", "veteran"] },
        { key: "packaging", stems: ["пакуван", "упаковк", "упакуван", "подарункове пак", "подарункову упак", "подарочн", "коробк", "листівк", "открытк", "цінник", "ценник", "чек$", "чека$", "чеком", "квитанц", "фіскальн", "фискальн", "gift wrap", "gift box", "packaging", "receipt", "price tag", "dust bag", "dustbag", "пильник", "пыльник", "чохол", "чехол"] },
        { key: "specs", pageOnly: true, stems: ["батарейк", "батарей", "battery", "элемент питания", "важить", "вага$", "вагу$", "весит", "вес$", "weight", "how heavy", "механізм", "механизм", "кварцов", "автоподзавод", "автопідзавод", "калібр", "калибр", "mechanism", "movement", "quartz", "automatic movement"] },
        { key: "certificate", stems: ["сертифікат", "сертификат", "gift card", "gift certificate", "voucher", "ваучер", "подарункова карт", "подарочная карт"] },
        { key: "care", stems: ["доглядат", "догляд за", "доглянути", "чистит", "почистит", "чистк", "ухаживат", "уход за", "care for", "take care", "how to clean", "clean it"] },
        { key: "promoPlans", stems: ["чорна п'ятниц", "чорну п'ятниц", "чорної п'ятниц", "чорна пятниц", "черная пятниц", "черную пятниц", "black friday", "cyber monday", "кіберпонеділ", "розпродаж буде", "знижки будуть", "буде знижк", "будуть знижк", "скидки будут", "будет скидк", "будут скидк", "will there be a sale", "will there be discounts", "upcoming sale"] },
        { key: "aboutShop", stems: ["на ринку", "давно працюєте", "скільки років ви", "як давно ви", "як довго ви працює", "как давно вы", "сколько лет вы", "давно работаете", "how long have you been", "years in business"] },
        { key: "origin", stems: ["країни виробництв", "якої країни", "яка країна", "какой страны", "страна-производ", "країн виробництва", "країна виробництва", "країну виробництва", "де виготовлен", "де зроблен", "made in", "страна производства", "страну производства", "где произведен", "где сделан", "country of origin", "з італії", "із італії", "из италии", "from italy", "італійськ", "итальянск", "italian"] },
        { key: "marketplaces", notWith: ["оригінал", "оригинал", "підробк", "подделк", "реплік", "реплик", "фейк", "fake", "replica", "authentic", "genuine", "real$"], stems: ["olx", "олх", "rozetka", "розетк", "prom", "пром юа", "епіцентр", "эпицентр", "маркетплейс", "marketplace"] },
        { key: "business", stems: ["юрлиц", "юр лиц", "юросіб", "юр особ", "юридичн особ", "юридическ лиц", "фоп", "з пдв", "с ндс", "безнал", "безготівк", "рахунок-фактур", "счет-фактур", "b2b", "for a company", "invoice"] },
        { key: "restock", stems: ["поповнен", "коли привезете", "коли буде в наявн", "коли зʼявиться", "коли з'явиться", "коли появиться", "пополнен", "когда привезете", "когда будет в налич", "когда появится", "restock", "back in stock", "when will it be available"] }
    ];
    // Власна відповідь з адмінки важливіша: написав власник про
    // розстрочку — бот відповідає нею, а не «уточніть у менеджера».
    const personal = ownerAnswer(text, data, lang) ? null : PERSONAL.find(p => hasStem(list, p.stems) && (!p.need || hasStem(list, p.need)) && !(p.notWith && hasStem(list, p.notWith)) && (!p.pageOnly || productFromPage(opts.page, data)));
    if (personal) {
        return reply(fill(T10[lang][personal.key], { url: pageUrl(site, "/aktsii/", lang) }), { handoff: true, pause: personal.key === "callback", intent: "handoff" });
    }

    // 1д'. Після оформлення. «Оплатила, а статус не змінився» — проблема,
    // власнику. «Оформила, що далі?» — що відбувається далі (як на сайті:
    // менеджер підтверджує, відправка 1–2 робочі дні, Нова пошта 1–3 дні).
    const PLACED = ["оформила", "оформив", "оформил", "замовила", "замовив", "заказала", "заказал", "placed an order", "i ordered", "made an order", "i've ordered", "just ordered"];
    const PROBLEM = ["не прийш", "не змін", "не оновл", "не отрима", "не подзвон", "не зателефон", "не бачу", "не видно", "не пришл", "не пришел", "не изменил", "не обнов", "не вижу", "haven't", "hasn't", "not updated", "didn't", "проблем", "помилк", "ошибк", "error"];
    if (hasStem(list, ["оплатил", "оплатив", "оплатила", "сплатил", "сплатив", "paid", "заплатил", "заплатила"]) && hasStem(list, PROBLEM)) {
        return reply(T31[lang].paidNoStatus, { handoff: true, pause: false, intent: "handoff" });
    }
    // «Замовила чорну сумку, де вона?» — про замовлення, а не підбірка чорних сумок.
    if (hasStem(list, PLACED) && hasStem(list, ["де вона", "де він", "де воно", "де моя", "де мій", "де моє", "где она", "где он", "где мой", "где моя", "where is it", "where's it"])) {
        return reply(fill(T4L.lost, { url: pageUrl(site, "/order-status", lang) }), { handoff: true, pause: false, intent: "status" });
    }
    if (hasStem(list, PLACED) && !hasStem(list, PROBLEM) && !hasStem(list, ["скасу", "отмен", "cancel", "змінит", "изменит", "change"]) && !(parseWish(text, data) || {}).criteria && !/\d{8,}/.test(text)) {
        return reply(fill(T31[lang].placed, { url: pageUrl(site, "/order-status", lang) }), { chips: [L.chips.human], intent: "faq" });
    }

    // 1е. «Працюєте у вихідні / в неділю?» — графік зі сторінки «Контакти».
    if (hasStem(list, ["вихідн", "неділ", "субот", "свят", "выходн", "воскресен", "суббот", "праздник", "weekend", "sunday", "saturday", "holiday", "сьогодні", "сегодня", "today", "зараз працю", "сейчас работ", "open now"])
        && hasStem(list, ["працює", "працюєте", "відповіда", "работает", "работаете", "отвечает", "open", "work", "are you"])) {
        return reply(fill(T10[lang].weekend, { hours: HOURS[lang] }), { chips: L.chips.menu.slice(0, 3), intent: "contacts" });
    }

    // 2. Де моє замовлення.
    if (hasStem(list, ["номер замовлен", "номер заказ", "order number", "my order number", "мій номер замовлен", "де моє замовлен", "где мой заказ", "статус замовлен", "статус заказ", "стан замовлен", "where is my order", "order status", "трек", "track", "накладн", "ттн"]) || /\b\d{8,12}\b/.test(text)) {
        return reply(fill(L.status, { url: pageUrl(site, "/order-status", lang) }), { chips: [L.chips.human], intent: "status" });
    }

    // 2а. Автовідповіді власника — понад усе вбудоване: власник знає
    // свій магазин краще за ключові слова в коді.
    const own = ownerAnswer(text, data, lang);
    if (own && own.missing) return reply(fill(L.handoff, { hours }), { handoff: true, pause: false, intent: "handoff" });
    if (own) return reply(own.text, { chips: [L.chips.human], intent: "owner" });

    // 2а''. «Яка різниця між першою і другою?» — поруч ціна, матеріал,
    // габарити з карток. «А яка більша / менша?» — з габаритів.
    {
        const shownC = lastShownSlugs(history).map(slug => (data.products || []).find(p => p.slug === slug)).filter(Boolean);
        const ORD = [["перш", "перв", "first", "1$"], ["друг", "втор", "second", "2$"], ["трет", "third", "3$"], ["четверт", "fourth", "4$"]];
        const card = (p, n) => {
            const d = p.details || {};
            const bits = [botMoney(botPriceNow(p, now))];
            if (d.material && d.material[lang]) bits.push(d.material[lang]);
            if (d.dimensions && d.dimensions[lang]) bits.push(d.dimensions[lang]);
            return `${n}. «${(p.title && (p.title[lang] || p.title.uk)) || p.slug}» — ${bits.join("; ")}\n${pageUrl(site, `/p/${p.slug}/`, lang)}`;
        };
        const diffAsk = hasStem(list, ["різниц", "порівня", "відрізня", "отлича", "разниц", "сравн", "difference", "compare", "differ"]) || (hasStem(list, ["вибрати між", "обрати між", "выбрать между", "choose between"]) && hasStem(list, ["перш", "перв", "first", "друг", "втор", "second", "трет", "third"]));
        if (!shownC.length && !productFromPage(opts.page, data) && diffAsk && hasStem(list, ["перш", "перв", "first", "друг", "втор", "second"])) return reply(T25[lang].noList, { chips: L.chips.types, intent: "ask" });
        const chooseAsk = hasStem(list, ["не можу вибрати", "не можу обрати", "не знаю яку", "не знаю який", "допоможіть вибрати", "допоможіть обрати", "яка з них", "який з них", "яку з них", "що б ви взяли", "що ви б взяли", "що б ви порадили", "яку б ви", "яка краща", "який кращ", "всі подобаються", "усі подобаються", "не могу выбрать", "помогите выбрать", "какая из них", "какой из них", "что бы вы взяли", "какая лучше", "какой лучше", "все нравятся", "i can't decide", "can't decide", "cannot decide", "help me choose", "which one would you", "which one is better", "which is better", "what would you take", "i like them all", "вибрати між", "выбрать между"]);
        if (shownC.length >= 2 && chooseAsk && !diffAsk) {
            const n = Math.min(shownC.length, 4);
            return reply(T29[lang].choose + "\n" + shownC.slice(0, n).map((p, i) => card(p, i + 1)).join("\n"), { chips: T13[lang].ordinals.slice(0, n), intent: "product" });
        }
        if (shownC.length >= 2 && diffAsk) {
            let idx = ORD.map((st, i) => hasStem(list, st) ? i : -1).filter(i => i >= 0 && i < shownC.length);
            if (idx.length < 2) idx = [0, 1];
            return reply(T21[lang].compare + "\n" + idx.slice(0, 3).map(i => card(shownC[i], i + 1)).join("\n"), { chips: T13[lang].ordinals.slice(0, Math.min(shownC.length, 4)), intent: "product" });
        }
        // «Покажіть більше» — прохання ще, а не «яка більша?».
        const other = hasStem(list, ["варіант", "вариант", "фото", "option", "photo", "picture", "покаж", "show", "дайте", "скиньте", "ще$", "еще$"]);
        const bigger = !other && hasStem(list, ["більша", "більшу", "більший", "побільше", "крупніш", "большая", "большую", "побольше", "крупнее", "больше$", "більше$", "bigger", "larger", "biggest", "largest"]);
        const smaller = !other && hasStem(list, ["менша", "меншу", "менший", "поменше", "компактніш", "меньшая", "меньшую", "поменьше", "компактнее", "меньше$", "менше$", "smaller", "smallest", "more compact"]);
        if (!shownC.length && !productFromPage(opts.page, data) && (bigger || smaller) && !typesOf(text).length && list.length <= 4) return reply(T25[lang].noList, { chips: L.chips.types, intent: "ask" });
        if (shownC.length >= 2 && (bigger || smaller) && !typesOf(text).length) {
            const sized = shownC.filter(p => bagArea(p) > 0).sort((a, b) => bagArea(b) - bagArea(a));
            if (!sized.length) return reply(T21[lang].noDims, { handoff: true, pause: false, intent: "product" });
            const p = bigger ? sized[0] : sized[sized.length - 1];
            return reply(fill(T21[lang][bigger ? "bigger" : "smaller"], { title: (p.title && (p.title[lang] || p.title.uk)) || p.slug, dims: p.details.dimensions[lang] || p.details.dimensions.uk, url: pageUrl(site, `/p/${p.slug}/`, lang) }), { chips: [L.chips.more[1]], intent: "product", focus: p.slug });
        }
    }

    // 2а'. «А друга якого кольору?», «скільки коштує перша?» — про товар
    // з ОСТАННЬОЇ підбірки бота, за номером. Відповідь — як на сторінці
    // цього товару, плюс посилання на нього.
    // «Беру», «хочу купити першу» — як оформити саме цю річ.
    const buyText = p => fill(T22[lang].buy, { title: (p.title && (p.title[lang] || p.title.uk)) || p.slug, price: botMoney(botPriceNow(p, now)), url: pageUrl(site, `/p/${p.slug}/`, lang) });
    const nth = ordinalOf(text);
    // «Беру», «я її беру» без номера: на сторінці товару — цей; після однієї
    // показаної чи розмови про одну річ — її.
    if (!nth && hasStem(list, BUY) && !(parseWish(text, data) || {}).criteria) {
        const shown1 = lastShownSlugs(history);
        const slug1 = (productFromPage(opts.page, data) || {}).slug || lastFocus(history) || (shown1.length === 1 ? shown1[0] : null);
        const p1 = slug1 && (data.products || []).find(p => p.slug === slug1);
        if (p1) return reply(buyText(p1), { chips: [L.chips.human], intent: "buy", focus: p1.slug });
        // «Беру, як замовити?» — спершу інструкція, номер річ людина вкаже на сайті.
        if (shown1.length > 1 && !hasStem(list, HOW_TO_ORDER)) return reply(fill(T13[lang].which, { n: shown1.length }), { chips: T13[lang].ordinals.slice(0, Math.min(shown1.length, 4)), intent: "ask" });
    }
    if (nth) {
        const shown = lastShownSlugs(history);
        // «Друга сумка чорна» — це запит, а не номер у списку, якого ще немає.
        if (!shown.length && !productFromPage(opts.page, data) && !lastFocus(history) && !(parseWish(text, data) || {}).criteria) return reply(T25[lang].noList, { chips: L.chips.types, intent: "ask" });
        // Показано одну — «друга» це вона ж (людина рахує інакше);
        // показано кілька, але менше — перепитати з наявними номерами.
        if (shown.length > 1 && nth > shown.length) {
            return reply(fill(T13[lang].which, { n: shown.length }), { chips: T13[lang].ordinals.slice(0, Math.min(shown.length, 4)), intent: "ask" });
        }
        const idx = shown.length === 1 ? 0 : nth - 1;
        const picked = shown[idx] && (data.products || []).find(p => p.slug === shown[idx]);
        if (picked && hasStem(list, RESERVE)) {
            return reply(fill(T22[lang].reserve, { title: (picked.title && (picked.title[lang] || picked.title.uk)) || picked.slug, url: pageUrl(site, `/p/${picked.slug}/`, lang) }), { handoff: true, pause: false, intent: "handoff", focus: picked.slug });
        }
        if (picked && hasStem(list, BUY)) return reply(buyText(picked), { chips: [L.chips.human], intent: "buy", focus: picked.slug });
        if (picked && hasStem(list, ["схож", "похож", "подібн", "аналог", "similar", "like the", "like this"])) {
            const base = botPriceNow(picked, now);
            const same = (data.products || []).filter(p => p.slug !== picked.slug && p.category === picked.category && Math.abs(botPriceNow(p, now) - base) <= base * 0.35)
                .sort((a, b) => Math.abs(botPriceNow(a, now) - base) - Math.abs(botPriceNow(b, now) - base)).slice(0, MAX_PRODUCTS);
            if (same.length) return reply(fill(T29[lang].similarTo, { title: (picked.title && (picked.title[lang] || picked.title.uk)) || picked.slug }), { products: same.map(p => ({ slug: p.slug, title: (p.title && (p.title[lang] || p.title.uk)) || p.slug, price: botPriceNow(p, now), url: pageUrl(site, `/p/${p.slug}/`, lang), preOrder: Boolean(p.preOrder || !p.inStock) })), chips: [L.chips.more[1]], intent: "products" });
        }
        if (picked) {
            const q = productAnswer(text, picked, data, lang, now, site);
            const link = `\n${pageUrl(site, `/p/${picked.slug}/`, lang)}`;
            if (q && !q.handoff) return reply(q.text + link, { chips: [L.chips.human], intent: "product", focus: picked.slug });
            // Конкретне питання, на яке в картці відповіді немає («друга
            // поляризована?») — чесно «не вказано» і власнику, а не загальний опис.
            if (q && q.handoff) return reply(q.text + link, { handoff: true, pause: false, intent: "product", focus: picked.slug });
            // Без конкретного питання («розкажіть про другу») — коротко все.
            const all = productAnswer("ціна наявність кольори розмір матеріал", picked, data, lang, now, site);
            if (all) return reply(all.text.replace(/\n[^\n]*(не вказано|isn't listed|не указано)[^\n]*$/, "") + link, { chips: [L.chips.human], intent: "product", focus: picked.slug });
        }
    }

    // 2а''. «Додай у кошик», «відкладіть для мене».
    if (hasStem(list, ["додай в кошик", "додайте в кошик", "додай у кошик", "додайте у кошик", "поклади в кошик", "добавь в корзину", "добавьте в корзину", "положи в корзину", "add to cart", "add it to cart", "add to my cart"])) {
        return reply(T8[lang].cart, { chips: [L.chips.menu[0], L.chips.human], intent: "how-to-order" });
    }
    if (hasStem(list, RESERVE)) {
        return reply(T8[lang].reserve, { handoff: true, pause: false, intent: "handoff" });
    }

    // 2а'''. Розмова про одну річ: щойно відповідали про «другу сумку» —
    // «а розміри?», «з чого вона?» стосуються її.
    if (!productFromPage(opts.page, data)) {
        const focusSlug = lastFocus(history);
        const focused = focusSlug && (data.products || []).find(p => p.slug === focusSlug);
        const q = focused && productAnswer(text, focused, data, lang, now, site);
        if (q && !q.handoff) {
            return reply(q.text + `\n${pageUrl(site, `/p/${focused.slug}/`, lang)}`, { chips: [L.chips.human], intent: "product", focus: focused.slug });
        }
    }

    // 2а''''. Після підбірки «а розміри?», «з чого?» без номера — про яку
    // з них? Перепитати краще, ніж «не зрозумів» і будити власника.
    if (!productFromPage(opts.page, data) && lastShownSlugs(history).length > 1
        && Object.keys(ASK).some(k => k !== "authentic" && k !== "discount" && k !== "fit" && hasStem(list, ASK[k]))
        && !hasStem(list, ["маломір", "маломер", "великомір", "большемер", "таблиц", "сітк", "сетк", "size chart", "size guide", "true to size"])
        && !((parseWish(text, data) || {}).criteria) && !((parseWish(text, data) || {}).more)) {
        const n = lastShownSlugs(history).length;
        const onlyPrice = hasStem(list, ASK.price || []) && !Object.keys(ASK).some(k => k !== "price" && hasStem(list, ASK[k]));
        const onlyColors = hasStem(list, ["кольор", "колір", "цвет", "color", "colour"]) && !Object.keys(ASK).some(k => k !== "colors" && hasStem(list, ASK[k]));
        if (onlyColors) {
            const shownP = lastShownSlugs(history).map(slug => (data.products || []).find(p => p.slug === slug)).filter(Boolean).slice(0, 4);
            const lines0 = shownP.map((p, i) => `${i + 1}. ${(p.title && (p.title[lang] || p.title.uk)) || p.slug} — ${(((p.details && p.details.variants) || []).map(v => colorName(v, lang)).filter(Boolean).join(", ")) || (p.colors || []).join(", ")}`);
            if (lines0.length) return reply(T30[lang].colorsAll + "\n" + lines0.join("\n"), { chips: T13[lang].ordinals.slice(0, Math.min(shownP.length, 4)), intent: "product" });
        }
        if (onlyPrice) {
            const prices = lastShownSlugs(history).map(slug => (data.products || []).find(p => p.slug === slug)).filter(Boolean).map(p => botPriceNow(p, now)).sort((a, b) => a - b);
            if (prices.length) return reply(fill(T20[lang].many, { min: botMoney(prices[0]), max: botMoney(prices[prices.length - 1]) }), { chips: T13[lang].ordinals.slice(0, Math.min(n, 4)), intent: "ask" });
        }
        return reply(fill(T13[lang].which, { n }), { chips: T13[lang].ordinals.slice(0, Math.min(n, 4)), intent: "ask" });
    }

    // 2б. Людина пише зі сторінки товару й питає про НЬОГО.
    const here = productFromPage(opts.page, data);
    const about = productAnswer(text, here, data, lang, now, site);
    if (about) {
        return reply(about.text, { handoff: Boolean(about.handoff), pause: false, chips: about.handoff ? [] : [L.chips.human], intent: "product" });
    }

    // 2в. Контакти й графік.
    if (hasStem(list, CONTACT_STEMS) && !(parseWish(text, data) || {}).criteria) {
        return reply(contactsReply(data, lang), { chips: L.chips.menu.slice(0, 3), intent: "contacts" });
    }

    // 2г. Промокод.
    if (hasStem(list, ["промокод", "промо-код", "промо код", "promo code", "promocode", "coupon", "купон", "код знижки", "код скидки", "discount code"])) {
        return reply(fill(T2[lang].promo, { url: pageUrl(site, "/aktsii/", lang) }), { chips: [L.chips.human], intent: "promo" });
    }

    // 2ґ. Базові діалоги: «ок», «дякую», «бувайте», «як справи», «ти бот?».
    // Лише коли в повідомленні немає запиту на товар: «дякую, а чорна є?»
    // — це вже питання.
    // «Дуже гарні сумки у вас!» — комплімент, хоч і з назвою речі.
    // «Гарного дня!» — прощання, а не комплімент.
    const praise = smallTalk(text) !== "bye" && hasStem(list, ["гарн", "красив", "класн", "круті", "чудов", "прекрасн", "шикарн", "beautiful", "lovely", "gorgeous", "nice", "amazing", "stunning"])
        && /!/.test(text) && !hasStem(list, ["хочу", "шукаю", "покаж", "є ", "есть", "ищу", "want", "looking", "show", "?"]) && !/\?/.test(text);
    if (praise) return reply(T4L.compliment, { chips: L.chips.types.slice(0, 4), intent: "ack" });

    // Питання важливіше за ввічливість: «дякую, а доставка скільки?» —
    // про доставку.
    const small = (criteria || findTopic(topicText) || hasStem(list, HOW_TO_ORDER) || hasStem(list, CHEAPER)) ? null : smallTalk(text);
    if (small === "ack") {
        const thanks = hasStem(list, ["дяку", "спасиб", "благодар", "thank", "thx", "ty$"]);
        return reply(thanks ? T4L.thanks : T4L.ack, { intent: "ack" });
    }
    if (small === "bye") return reply(T4L.bye, { intent: "bye" });
    if (small === "anyone") return reply(T9[lang].anyone, { chips: L.chips.menu.slice(0, 3), intent: "smalltalk" });
    if (small === "compliment") return reply(T4L.compliment, { intent: "ack" });
    if (small === "smalltalk") return reply(T4L.smalltalk, { chips: L.chips.menu.slice(0, 3), intent: "smalltalk" });
    if (small === "about-bot") return reply(T4L.aboutBot, { chips: L.chips.menu, intent: "about-bot" });

    if (!criteria && list.length <= 4 && hasStem(list, GREETINGS)) {
        const lastBotMsg = (history || []).slice().reverse().find(m => m && m.author === BOT_AUTHOR);
        const greetedJustNow = lastBotMsg && /👋/.test(String(lastBotMsg.body || "")) && !/₴/.test(String(lastBotMsg.body || ""));
        if (greetedJustNow) return reply(T23[lang].again, { chips: L.chips.menu, intent: "hello" });
        return reply(fill(T5[lang].hello, { greet: greet || T5[lang].hello.split("!")[0] || "Вітаю" }).replace(/^\{greet\}/, ""),
            { chips: L.chips.menu, intent: "hello" });
    }

    // 2д''. «Скільки чекати під замовлення?» — строк свій у кожної речі.
    const PRE = ["під замовлен", "под заказ", "to order", "pre-order", "preorder", "made to order"];
    const prevVisitor = (history || []).filter(m => m && m.author === "visitor").slice(-1)[0];
    if ((hasStem(list, PRE) || (prevVisitor && hasStem(words(prevVisitor.body), PRE) && hasStem(list, ["чекати", "чекат", "ждать", "wait"])))
        && hasStem(list, ["скільки", "сколько", "як довго", "как долго", "how long", "коли", "когда", "when", "строк", "срок", "термін"])
        && !((parseWish(text, data) || {}).criteria)) {
        return reply(T16[lang].preorder, { chips: [L.chips.human], intent: "faq" });
    }

    // 2д'''. Відгуки — на сторінці товару.
    if (hasStem(list, ["відгук", "отзыв", "review"]) && !((parseWish(text, data) || {}).criteria)) {
        return reply(T16[lang].reviews, { chips: L.chips.menu.slice(0, 3), intent: "faq" });
    }

    // 2д''''. «У мене питання щодо замовлення» — що надіслати.
    if (hasStem(list, ["щодо замовлен", "по замовленню", "про моє замовлен", "про замовлен", "питання по замовл", "по заказу", "о заказе", "по моему заказу", "about my order", "question about my order", "my order"])) {
        return reply(T16[lang].orderQ, { chips: [L.chips.human], intent: "status" });
    }

    // 2д'. Як підібрати розмір: таблиця є на сторінці товару.
    if (hasStem(list, ["розмірна сітк", "розмірну сітк", "таблиц розмір", "таблиця розмір", "як підібрати розмір", "як обрати розмір", "маломір", "великомір", "размерная сетк", "размерную сетк", "таблиц размер", "как подобрать размер", "как выбрать размер", "маломер", "большемер", "size chart", "size guide", "what size", "which size", "fit true to size", "true to size"])) {
        return reply(T9[lang].sizeGuide, { chips: [L.chips.human], intent: "faq" });
    }

    // 2г'. «Передоплата потрібна?» / «а накладений платіж?» — відповідь із
    // FAQ про картку починається «Так.» і на «передоплата потрібна?»
    // звучала б як «так, потрібна». Факти — ті самі, що в розділі оплати.
    if (!criteria && hasStem(list, ["передоплат", "предоплат", "prepay", "prepaid", "upfront", "аванс"])) {
        return reply(T18[lang].prepay + `\n${L.faqMore} ${pageUrl(site, "/delivery-payment", lang)}`, { chips: L.chips.menu.slice(0, 5), intent: "faq" });
    }
    if (!criteria && hasStem(list, ["накладен", "наложен", "післяплат", "наложк", "налож", "cash on delivery", "cod$", "pay on delivery", "payment on delivery", "pay upon delivery", "при отриманні", "при получении"]) && !hasStem(list, ["оглян", "огляд", "осмотр", "перевір", "inspect"])
        // Інша тема поруч («скільки доставка і чи можна оплатити при
        // отриманні?») — відповідаємо на всі питання нижче. Саму фразу
        // про оплату при отриманні вирізаємо, щоб «delivery» в ній не
        // рахувалась окремою темою.
        && findTopics(String(text).replace(/pay(?:ment)?\s+(?:up)?on\s+delivery|on\s+delivery|при\s+отриманні|при\s+получении|накладен\S*|наложен\S*|післяплат\S*/gi, " "), (data.faq && data.faq[lang]) || [])
            .filter(x => x.topic.key !== "payment").length === 0) {
        return reply(T18[lang].cod + `\n${L.faqMore} ${pageUrl(site, "/delivery-payment", lang)}`, { chips: L.chips.menu.slice(0, 5), intent: "faq" });
    }

    // 2д'. «А якщо я з Харкова, доставите?» — в будь-яке місто України
    // (закордон — вище, менеджеру). Факти — як в оформленні й картках.
    if (!criteria && hasStem(list, ["доставите", "доставляєте", "доставляете", "відправите", "відправляєте", "отправите", "отправляете", "привезете", "deliver to", "ship to", "do you deliver", "do you ship"])
        && hasStem(list, ["місто", "міста", "село", "смт", "област", "україн", "украин", "ukraine", "харків", "харкова", "харьков", "львів", "львова", "львов", "одес", "дніпр", "днепр", "запоріж", "запорож", "київ", "києва", "киев", "kyiv", "kharkiv", "lviv", "odesa", "odessa", "dnipro", "вінниц", "винниц", "полтав", "черніг", "черниг", "чернів", "черновц", "житомир", "рівн", "ровн", "луцьк", "луцк", "ужгород", "франків", "тернопіл", "тернопол", "хмельниц", "черкас", "кропивн", "миколаїв", "николаев", "херсон", "суми", "сумы", "краматор", "я з$", "я из$", "i'm from", "i live in", "до мене", "ко мне"])
        && findTopics(topicText, (data.faq && data.faq[lang]) || []).filter(x => !["delivery", "delivery-time"].includes(x.topic.key)).length === 0
        && !hasStem(list, ["кордон", "границ", "abroad", "europe", "польщ", "польш", "poland", "germany", "німеч", "герман", "сша", "usa"])) {
        return reply(T23[lang].city, { chips: L.chips.menu.slice(0, 5), intent: "faq" });
    }

    // 2д''. «Які окуляри до круглого обличчя?» — порадить менеджер; щоб
    // людина не чекала, одразу всі окуляри (з тим, що вже сказано).
    if (hasStem(list, ["до кругл", "до овальн", "до квадратн", "до трикутн", "форм обличч", "форма обличч", "тип обличч", "к кругл", "к овальн", "к квадратн", "форма лица", "форму лица", "тип лица", "face shape", "round face", "oval face", "square face", "широке обличчя", "широкого обличчя", "вузьке обличчя", "широкое лицо", "узкое лицо", "wide face", "narrow face"])) {
        const fw = Object.assign({}, parseWish(text, data) || {}, { type: "glasses", criteria: 1 });
        const g = pickProducts(fw, data, now, 0);
        return reply(T24[lang].face, { products: g.items.map(p => ({ slug: p.slug, title: (p.title && (p.title[lang] || p.title.uk)) || p.slug, price: botPriceNow(p, now), url: pageUrl(site, `/p/${p.slug}/`, lang), preOrder: Boolean(p.preOrder || !p.inStock) })), chips: [L.chips.more[1]], handoff: true, pause: false, intent: "products" });
    }

    // 2д'''. «Чому деякі товари під замовлення?»
    if (hasStem(list, ["чому", "почему", "why", "навіщо", "зачем"]) && hasStem(list, ["під замовлен", "под заказ", "pre-order", "preorder", "to order"])) {
        return reply(T24[lang].whyPreorder, { chips: [L.chips.human], intent: "faq" });
    }

    // «Я з Києва», «я з Харкова» — людина каже, звідки; відповідь та сама.
    if (!criteria && list.length <= 5 && /^(?:а\s+)?(?:я|ми|мы|i'm|we're|i am)\s+(?:з|із|зі|из|from)\s+/i.test(text.trim())
        && !hasStem(list, ["кордон", "границ", "abroad", "польщ", "польш", "poland", "germany", "німеч", "герман", "сша", "usa", "europe"])) {
        return reply(T23[lang].city, { chips: L.chips.menu.slice(0, 5), intent: "faq" });
    }

    // 2д°. «Дайте посилання на каталог», «сайт англійською?», «ціни в доларах?»
    if (!criteria && hasStem(list, ["посилання на каталог", "ссылку на каталог", "де каталог", "где каталог", "весь каталог", "link to the catalog", "catalog link", "full catalog"])) {
        return reply(fill(T28[lang].catalog, { url: pageUrl(site, "/catalog", lang) }), { chips: L.chips.types.slice(0, 4), intent: "faq" });
    }
    if (hasStem(list, ["англійськ", "английск", "in english", "english version", "російськ", "русск", "russian version", "іншою мовою", "другом языке"]) && hasStem(list, ["сайт", "версі", "верси", "мов", "язык", "website", "site", "version"])) {
        return reply(fill(T28[lang].langs, { en: `${site}/en/`, ru: `${site}/ru/`, uk: `${site}/` }), { chips: L.chips.menu.slice(0, 3), intent: "faq" });
    }
    if (hasStem(list, ["в долар", "в доллар", "in dollars", "in usd", "in euro", "у гривн", "в гривн", "в гривен", "яка валюта", "какая валюта", "what currency", "which currency"]) && hasStem(list, ["цін", "цен", "price", "валют", "currency", "коштує", "стоит"])) {
        return reply(T28[lang].currency, { chips: L.chips.budget, intent: "faq" });
    }

    // 2д·. «Вона якісна?», «довго прослужить?» — що відомо напевно: оригінал з
    // офіційного магазину бренду, гарантія й 14 днів на повернення.
    if (!criteria && hasStem(list, ["варто брати", "варто купувати", "варто її брати", "стоит брать", "стоит покупать", "worth it", "worth buying", "якісн", "якість", "якості", "качеств", "quality", "прослуж", "довговічн", "носитиметься", "износ", "долговечн", "durable", "well made", "last long"])) {
        return reply(fill(T29[lang].quality, { url: pageUrl(site, "/return-warranty", lang) }), { chips: [L.chips.human], intent: "faq" });
    }
    if (!criteria && list.length <= 6 && hasStem(list, ["подумаю", "я подумаю", "ще подумаю", "порадж", "порадюсь", "посоветуюсь", "подумать", "подумаем", "think about it", "i'll think", "let me think"])) {
        return reply(T29[lang].think, { chips: [L.chips.menu[0]], intent: "ack" });
    }

    // 2д. Як оформити замовлення.
    if (hasStem(list, HOW_TO_ORDER)) {
        return reply(T4L.howToOrder, { chips: [L.chips.menu[0], L.chips.menu[1], L.chips.menu[2]], intent: "how-to-order" });
    }

    // 2е. Гарантія.
    if (hasStem(list, WARRANTY) && (!criteria || (criteria === 1 && hasStem(list, ["гаранті", "warranty", "guarantee"])))) {
        // «Прийшов з дефектом», «зламався» — уже проблема, а не довідка:
        // власник мусить знати одразу (бот і далі відповідає).
        const defect = hasStem(list, ["брак", "дефект", "зламал", "сломал", "поломал", "порван", "порвал", "тріснул", "треснул", "пошкоджен", "поврежден", "defect", "broken", "broke$", "damaged", "torn"]);
        return reply(fill(T4L.warranty, { url: pageUrl(site, "/return-warranty", lang) }) + `\n${L.faqMore} ${pageUrl(site, "/return-warranty", lang)}`,
            Object.assign({ chips: [L.chips.human], intent: "faq" }, defect ? { handoff: true, pause: false } : {}));
    }

    // 2є. «Дорого», «а дешевше є?» — той самий запит, але дешевше за
    // найдешевше, що вже показали. Без попереднього запиту — найдоступніше.
    if (hasStem(list, CHEAPER) && !((parseWish(text, data) || {}).budget && (parseWish(text, data) || {}).type) && !hasStem(list, ["оригінал", "оригинал", "підробк", "подделк", "реплік", "реплик", "фейк", "fake", "replica", "authentic", "genuine", "real$"])) {
        const previous = (history || []).filter(m => m && m.author === "visitor").slice(-CONTEXT_MESSAGES).reverse()
            .map(m => parseWish(m.body, data)).filter(Boolean);
        const base = mergeWishes(parseWish(text, data) || { criteria: 0 }, previous);
        const shownPrices = [];
        // Остання відповідь бота З ТОВАРАМИ: після «дешевшого немає»
        // наступне «ще дешевше» інакше починало з найдешевшого заново.
        const lastBot = (history || []).slice().reverse().find(m => m && m.author === BOT_AUTHOR && /₴/.test(String(m.body || "")));
        String(lastBot && lastBot.body || "").split("\n").forEach(l => {
            const m = l.match(/—\s+([\d\s  ]+)₴/);
            if (m) shownPrices.push(Number(m[1].replace(/\D/g, "")));
        });
        let ceiling = shownPrices.length ? Math.min(...shownPrices) - 1 : 0;
        // На сторінці товару без іншого запиту — дешевше за ЦЮ річ, того ж розділу.
        const herePage = productFromPage(opts.page, data);
        if (herePage && !base.type && !base.brand) {
            const t = TYPES.find(x => (x.category && x.category === herePage.category) || (x.department && x.department === herePage.department));
            if (t) { base.type = t.key; base.criteria = 1; }
            ceiling = botPriceNow(herePage, now) - 1;
        }
        const cheapWish = Object.assign({}, base, { cheap: true, more: false },
            ceiling > 0 ? { budget: Object.assign({}, base.budget || {}, { max: ceiling }) } : {});
        const picked = pickProducts(cheapWish, data, now, 0);
        if (picked.items.length) {
            return reply(ceiling > 0 ? T4L.cheaper : T4L.cheapest, {
                products: picked.items.map(p => ({
                    slug: p.slug,
                    title: (p.title && (p.title[lang] || p.title.uk)) || p.slug,
                    price: botPriceNow(p, now),
                    url: pageUrl(site, `/p/${p.slug}/`, lang),
                    preOrder: Boolean(p.preOrder || !p.inStock)
                })),
                chips: [L.chips.more[1]],
                intent: "cheaper"
            });
        }
        return reply(T4L.noCheaper, { chips: [L.chips.more[1]], intent: "cheaper" });
    }

    // 3. Тема з частих питань.
    const topic = findTopic(topicText);
    const faq = (data.faq && data.faq[lang]) || [];

    // «Ваші сумки оригінальні?» — питання про оригінальність, хоч у ньому
    // й названо тип: такі теми (always) відповідаються завжди.
    // «Справжня шкіра», «genuine leather» — про матеріал, а не про
    // оригінальність: тоді й тип у запиті важить.
    const strictFake = topic && topic.always
        && hasStem(list, ["оригінал", "оригинал", "підробк", "подделк", "реплік", "реплик", "фейк", "fake", "replica", "original", "authentic", "real$"])
        && !hasStem(list, ["шкір", "кож", "leather", "замш", "suede"]);
    // «А оригінальні сумки Coach є?» — і про оригінальність, і запит на
    // товар. Відповідь із сайту починається словом «Ні» (реплік немає) —
    // поруч із запитом на сумки воно читалося б як «сумок немає». Тож
    // коротко «так, оригінал» і далі — самі сумки.
    let authPrefix = "";
    if (strictFake && (parseWish(text, data) || {}).criteria) authPrefix = T4[lang].authYes + "\n";
    else if (topic && (strictFake || !(parseWish(text, data) || {}).criteria)) {
        // «Скільки доставка і чи можна оплатити при отриманні?» — на ВСІ
        // питання, до трьох, кожне окремим абзацом; посилання — один раз.
        const many = findTopics(topicText, faq).filter(x => x.item || (x.topic.legal && lang !== "uk"));
        if (many.length > 1) {
            const parts = many.slice(0, 3).map(x => x.item ? topicAnswer(x.topic, x.item, list, lang, text)
                : fill(L.returnsLegal, { url: pageUrl(site, "/return-warranty", lang) }));
            const pages = [...new Set(many.slice(0, 3).filter(x => x.item).map(x => x.item.page))];
            const links = pages.map(p => pageUrl(site, p, lang)).join(" · ");
            return reply(parts.join("\n\n") + (links ? `\n${L.faqMore} ${links}` : ""), { chips: L.chips.menu.slice(0, 5), intent: "faq" });
        }
        if (topic.legal && lang !== "uk") {
            return reply(fill(L.returnsLegal, { url: pageUrl(site, "/return-warranty", lang) }), { chips: L.chips.menu.filter(c => c !== L.chips.menu[4]), intent: "faq" });
        }
        const item = faq.find(f => topic.faq.test(f.q)) || faqByWords(text, faq);
        if (item) {
            let answer = topicAnswer(topic, item, list, lang, text);
            // На сайті питання «Чи є фізичний магазин?» і відповідь
            // починається з «Ні,». На «де ви знаходитесь?» таке «Ні»
            // звучить як відмова відповідати — прибираємо його.
            if (topic.key === "store" && hasStem(list, ["знаходит", "находит", "де ви$", "где вы$", "в якому місті", "в каком городе", "where are you", "located"])) {
                answer = answer.replace(/^(Ні|Нет|No)[,.]\s*/i, "");
                answer = answer.charAt(0).toUpperCase() + answer.slice(1);
            }
            return reply(`${answer}\n${L.faqMore} ${pageUrl(site, item.page, lang)}`, { chips: L.chips.menu.slice(0, 5), intent: "faq" });
        }
    }

    // 3а. «Хочу штани», а штанів у магазині немає: чесно, і що є натомість.
    // Лише коли в запиті немає типу, який у нас Є: «сумка з довгим ременем»
    // — це сумка, а не ремінь.
    const missing = hasStem(list, ["під джинс", "до джинс", "к джинс", "with jeans", "під сукн", "до сукн", "под плать", "к плать", "with a dress"]) ? null : findMissing(text);
    const missingWish = parseWish(text, data) || {};
    const kidsInCatalog = missing && missing.key === "kids" && (data.products || []).some(p => /Дитяч/.test(p.category));
    // Тип — з усієї розмови, як у підборі: «годинник» → «жіночий» →
    // «золотий» → «а на шкіряному ремінці?» — годинник чотири репліки тому.
    const prevTypeM = mergeWishes(missingWish.criteria ? missingWish : { criteria: 0 }, (history || []).filter(m => m && m.author === "visitor").slice(-CONTEXT_MESSAGES).reverse()
        .map(m => parseWish(m.body, data)).filter(Boolean)).type || shownType(history, data);
    const watchStrap = missing && missing.key === "belts" && prevTypeM === "watches";
    if (missing && missing.key === "kids" && missingWish.type && !kidsInCatalog) {
        const typeGen = String(TYPE_WORDS[lang][missingWish.type] || "").toLowerCase();
        return reply(fill(T28[lang].kidsType, { what: typeGen }), { chips: L.chips.types.slice(0, 4), intent: "missing" });
    }
    if (missing && !missingWish.type && !kidsInCatalog && !watchStrap) {
        const T5L = T5[lang];
        const what = missing.what[lang] || missing.what.uk;
        if (missing.similar) {
            const sim = pickProducts(Object.assign({}, missingWish, { type: missing.similar, criteria: 1 }), data, now, 0);
            if (sim.items.length) {
                const simWord = DESC[lang].type[missing.similar];
                return reply(fill(T5L.missingSimilar, { What: what.charAt(0).toUpperCase() + what.slice(1), similar: simWord }), {
                    products: sim.items.map(p => ({
                        slug: p.slug,
                        title: (p.title && (p.title[lang] || p.title.uk)) || p.slug,
                        price: botPriceNow(p, now),
                        url: pageUrl(site, `/p/${p.slug}/`, lang),
                        preOrder: Boolean(p.preOrder || !p.inStock)
                    })),
                    chips: [L.chips.more[1]],
                    intent: "missing"
                });
            }
        }
        // Пропонуємо те, що є в каталозі, — кнопками типів.
        const present = new Set((data.products || []).map(p => p.category).concat((data.products || []).map(p => p.department)));
        const typeChips = L.chips.types.filter((c, i) => {
            const key = ["bags", "bags", "watches", "glasses", "sneakers", "wallets"][i];
            const t = TYPES.find(x => x.key === key);
            return t && (present.has(t.category) || present.has(t.department));
        });
        return reply(fill(T5L.missing, { what }), { chips: typeChips.concat(L.chips.human).slice(0, 7), intent: "missing" });
    }

    // 3б. «Покажи схожі» на сторінці товару: той самий тип, ціна в межах
    // ±35 %, без самого товару.
    if (here && hasStem(list, ["схож", "похож", "подібн", "аналог", "similar", "like this", "alternatives", "щось таке", "что-то такое"])) {
        const base = botPriceNow(here, now);
        const same = (data.products || []).filter(p => p.slug !== here.slug && p.category === here.category
            && Math.abs(botPriceNow(p, now) - base) <= base * 0.35)
            .sort((a, b) => Math.abs(botPriceNow(a, now) - base) - Math.abs(botPriceNow(b, now) - base)).slice(0, MAX_PRODUCTS);
        if (same.length) {
            return reply(T7[lang].similar, { products: same.map(p => ({
                slug: p.slug, title: (p.title && (p.title[lang] || p.title.uk)) || p.slug, price: botPriceNow(p, now),
                url: pageUrl(site, `/p/${p.slug}/`, lang), preOrder: Boolean(p.preOrder || !p.inStock)
            })), chips: [L.chips.more[1]], intent: "products" });
        }
    }

    // 3в. «Скільки коштують годинники?», «яка ціна сумок Coach?»,
    // «скільки у вас сумок?» — відповідь числами, і приклади.
    const priceAsk = hasStem(list, ["скільки кошту", "сколько стоят", "сколько стоит", "яка ціна", "які ціни", "какая цена", "какие цены", "ціни на", "цены на", "how much are", "how much do", "price range", "prices for", "what are the prices"]);
    const countAsk = hasStem(list, ["скільки у вас", "скільки є", "сколько у вас", "сколько есть", "how many"]);
    const askWish = parseWish(text, data) || {};
    if ((priceAsk || countAsk) && (askWish.type || askWish.brand)) {
        const all = (data.products || []).filter(p => matches(p, Object.assign({}, askWish, { budget: undefined }), now, {}));
        if (all.length) {
            const prices = all.map(p => botPriceNow(p, now)).sort((a, b) => a - b);
            const desc = describeWish(Object.assign({}, askWish, { budget: undefined }), lang);
            const n = all.length;
            const head0 = countAsk
                ? fill(T7[lang].count, { desc, n, variants: plural(n, T5[lang].variants, lang), min: botMoney(prices[0]), max: botMoney(prices[prices.length - 1]) })
                : fill(T7[lang].range, { desc, min: botMoney(prices[0]), max: botMoney(prices[prices.length - 1]), n, variants: plural(n, T5[lang].variants, lang) });
            const picked0 = pickProducts(Object.assign({}, askWish, { budget: undefined, cheap: true }), data, now, 0);
            return reply(head0.charAt(0).toUpperCase() + head0.slice(1), { products: picked0.items.map(p => ({
                slug: p.slug, title: (p.title && (p.title[lang] || p.title.uk)) || p.slug, price: botPriceNow(p, now),
                url: pageUrl(site, `/p/${p.slug}/`, lang), preOrder: Boolean(p.preOrder || !p.inStock)
            })), chips: L.chips.budget.concat(L.chips.more[1]), intent: "products" });
        }
    }

    // 3г. «Що краще, Coach чи Michael Kors?» — по дві моделі кожного.
    // Сказати «кращий» бот не може й не має: обидва оригінальні, вибір —
    // за смаком, тож показуємо поруч.
    let both = findBrands(text, data);
    if (both.length === 1 && hasStem(list, ["краща за", "кращий за", "краще за", "гірша за", "порівняно з", "чим вона", "чим він", "лучше чем", "хуже чем", "чем она", "чем он", "по сравнению", "better than", "worse than", "compared to", "vs$"])) {
        const prevB = (history || []).filter(m => m && m.author === "visitor").slice(-CONTEXT_MESSAGES).reverse().map(m => (parseWish(m.body, data) || {}).brand).find(b => b && b !== both[0]);
        if (prevB) both = [prevB, both[0]];
    }
    if (both.length === 2 && hasStem(list, ["краща за", "кращий за", "краще за", "чим вона", "чим він", "лучше чем", "чем она", "чем он", "better than", "compared to", "чи$", "або$", "или$", "or$", "vs$", "versus", "відрізня", "отлича", "різниц", "разниц", "difference", "differ", "порівня", "сравн", "compare", "краще", "лучше", "better"])) {
        const cw = parseWish(text, data) || {};
        if (!cw.type && both.every(b => (data.products || []).some(p => p.brand === b && p.department === "Сумки"))) cw.type = "bags";
        const pick2 = b => pickProducts(Object.assign({}, cw, { brand: b, models: undefined }), data, now, 0).items.slice(0, 2);
        const pair = both.flatMap(pick2);
        if (pair.length) {
            return reply(fill(T11[lang].compare, { a: both[0], b: both[1] }), { products: pair.map(p => ({
                slug: p.slug, title: (p.title && (p.title[lang] || p.title.uk)) || p.slug, price: botPriceNow(p, now),
                url: pageUrl(site, `/p/${p.slug}/`, lang), preOrder: Boolean(p.preOrder || !p.inStock)
            })), chips: [both[0], both[1], L.chips.more[1]], intent: "products" });
        }
    }

    // 3ґ. «У вас є Louis Vuitton?», «а гаманці Guess?» — бренду немає в
    // каталозі. Раніше бот питав «Що саме шукаєте?» або показував чужі
    // гаманці мовчки, ніби Guess є. Тепер чесно, з байєр-сервісом.
    const otherBrand = findOtherBrand(text, data);
    if (otherBrand) {
        const T18L = T18[lang];
        const url = pageUrl(site, "/bayer-service", lang);
        const ow = Object.assign({}, parseWish(text, data) || { criteria: 0 }, { brand: undefined });
        if (ow.type) {
            const alt = pickProducts(ow, data, now, 0);
            if (alt.items.length) {
                return reply(fill(T18L.otherTyped, { brand: otherBrand, desc: describeWish(ow, lang), url }), {
                    products: alt.items.map(p => ({
                        slug: p.slug, title: (p.title && (p.title[lang] || p.title.uk)) || p.slug, price: botPriceNow(p, now),
                        url: pageUrl(site, `/p/${p.slug}/`, lang), preOrder: Boolean(p.preOrder || !p.inStock)
                    })), chips: [L.chips.more[1]], handoff: true, pause: false, intent: "other-brand"
                });
            }
        }
        const top = brandsInStock(data);
        return reply(fill(T18L.other, { brand: otherBrand, url, list: top.slice(0, 8).join(", ") }), {
            chips: top.slice(0, 4), handoff: true, pause: false, intent: "other-brand"
        });
    }
    if (hasStem(list, ["бренди$", "брендів$", "бренды$", "брендов$", "brands$", "марки$", "які бренди", "які у вас бренди", "які є бренди", "список брендів", "з люксу", "із люксу", "які марки", "какие бренды", "какие у вас бренды", "список брендов", "из люкса", "какие марки", "what brands", "which brands", "brands do you", "list of brands"])) {
        const bt = (parseWish(text, data) || {}).type;
        const top = brandsInStock(bt ? { products: (data.products || []).filter(p => matches(p, { type: bt }, now, {})) } : data);
        const head = bt ? fill(T21[lang].brandsOf, { what: DESC[lang].type[bt].charAt(0).toUpperCase() + DESC[lang].type[bt].slice(1), list: top.join(", ") }) : fill(T18[lang].brands, { list: top.join(", ") });
        return reply(head, { chips: top.slice(0, 5), intent: "brands" });
    }

    // 3д. Голе «скільки?» / «ціна?» після підбірки: одна річ — її ціна,
    // кілька — діапазон і «про яку розповісти?». Раніше — «не зрозумів».
    const bareHowMuch = list.filter(w => !["а", "і", "и", "ну", "так"].includes(w)).length === 1 && hasStem(list, ["скільки$", "сколько$"]);
    if (!here && list.length <= 4 && (bareHowMuch || hasStem(list, ["кошту", "стоит", "стоят", "почем", "ціна$", "цена$", "по ціні", "по цінах", "по цене", "по ценам", "how much", "price$"])) && !(parseWish(text, data) || {}).criteria) {
        const shownNow = lastShownSlugs(history).map(slug => (data.products || []).find(p => p.slug === slug)).filter(Boolean);
        if (shownNow.length === 1) {
            const p = shownNow[0];
            return reply(fill(T20[lang].one, { title: (p.title && (p.title[lang] || p.title.uk)) || p.slug, price: botMoney(botPriceNow(p, now)), url: pageUrl(site, `/p/${p.slug}/`, lang) }), { chips: [L.chips.more[1]], intent: "product", focus: p.slug });
        }
        if (shownNow.length > 1) {
            const prices = shownNow.map(p => botPriceNow(p, now)).sort((a, b) => a - b);
            return reply(fill(T20[lang].many, { min: botMoney(prices[0]), max: botMoney(prices[prices.length - 1]) }), { chips: T13[lang].ordinals.slice(0, Math.min(shownNow.length, 4)), intent: "ask" });
        }
        // Нічого не показано — раніше тут була відповідь про ціну доставки.
        if (!shownNow.length) return reply(T23[lang].whatPrice, { chips: L.chips.types, intent: "ask" });
    }

    // 3е. Коротке питання про «річ» без самої речі.
    if (!here && list.length <= 4 && !lastShownSlugs(history).length && !lastFocus(history)
        && (/^\s*\++\s*$/.test(text) || hasStem(list, ["інфо$", "інфа$", "инфо$", "деталі$", "подробиц", "подробн", "актуальн", "продан", "наявн", "наличи", "available$", "in stock", "розмір$", "размер$", "size$", "ціну в", "цену в", "ціну пишіть", "info$", "details$", "про цю", "про неї", "про нього", "про эту", "про нее", "про неё", "about this", "about it"]))
        && !(parseWish(text, data) || {}).criteria) {
        return reply(T23[lang].whatPrice, { chips: L.chips.types, intent: "ask" });
    }

    // 4. Підбір товару.
    let wish = parseWish(text, data);

    // «Бюджет 3000» → «а 5000?»: саме число після запиту з бюджетом — новий бюджет.
    if (!wish && list.length <= 3) {
        const num = Number(((String(text).match(/\d[\d\s  ]{2,}\d|\d{3,}/) || [""])[0]).replace(/\D/g, ""));
        const prevBudget = (history || []).filter(m => m && m.author === "visitor").slice(-CONTEXT_MESSAGES).reverse()
            .map(m => parseWish(m.body, data)).filter(Boolean).find(w => w.budget);
        if (prevBudget && num >= 300 && num <= 500000) wish = { budget: { max: num }, criteria: 1 };
    }

    // «Кросівки 43» → «а 44?»: саме число без інших слів — розмір, якщо
    // перед ним шукали взуття (parseWish на «а 44?» нічого не знаходить).
    if (!wish) {
        const prevT = (history || []).filter(m => m && m.author === "visitor").slice(-CONTEXT_MESSAGES).reverse()
            .map(m => (parseWish(m.body, data) || {}).type).find(Boolean);
        const size0 = prevT === "sneakers" && list.length <= 3 ? parseShoeSize(text, "sneakers") : null;
        if (size0) wish = { size: size0, criteria: 1 };
    }

    // «Кросівки» → «а 40-й є?»: число тут — розмір, бо перед ним
    // шукали взуття. Без цього контексту «40» нічого не означає.
    if (wish && !wish.size) {
        const prevType = (history || []).filter(m => m && m.author === "visitor").slice(-CONTEXT_MESSAGES).reverse()
            .map(m => (parseWish(m.body, data) || {}).type).find(Boolean);
        const size = prevType === "sneakers" ? parseShoeSize(text, "sneakers") : null;
        if (size) { wish.size = size; wish.criteria = (wish.criteria || 0) + 1; }
    }

    // Подарунок без деталей — спершу «для кого й на який бюджет»: показати
    // весь каталог зі 103 речей на «подарунок» — не допомога.
    // «Подарунок колезі, бюджет невеликий» — бюджет названо: найдоступніше одразу.
    if (wish && wish.gift && !wish.criteria && !wish.cheap) {
        return reply(T8[lang].gift, { chips: L.chips.types.slice(0, 4).concat(L.chips.budget.slice(0, 2)), intent: "ask" });
    }

    // «Я вже замовляла у вас, хочу ще» — раді, що повертаються.
    if (wish && !wish.criteria && hasStem(list, ["замовлял", "заказывал", "купувал", "покупал", "ordered from you", "bought from you", "вже замовл", "уже заказ"]) && hasStem(list, ["ще", "еще", "again", "знову", "снова", "more"])) {
        return reply(T24[lang].returning, { chips: L.chips.types, intent: "ask" });
    }

    // Кнопки меню без критеріїв: «Підібрати річ» — питаємо, що саме.
    if (wish && !wish.criteria && !wish.more && !wish.gift && !wish.fresh && !wish.sale && !wish.recommend && !wish.cheap && !wish.pricey && !(history || []).some(m => m && m.author === "visitor" && parseWish(m.body, data))) {
        return reply(L.askWhat, { chips: L.chips.types, intent: "ask" });
    }

    if (wish) {
        const curTypes = typesOf(text);
        const lastVisitor = (history || []).filter(m => m && m.author === "visitor").slice(-1)[0];
        const pairTypes = curTypes.length >= 2 ? curTypes
            : (!curTypes.length && lastVisitor && typesOf(lastVisitor.body).length >= 2 ? typesOf(lastVisitor.body) : null);
        if (pairTypes) {
            const prevW = (history || []).filter(m => m && m.author === "visitor").slice(-CONTEXT_MESSAGES).reverse().map(m => parseWish(m.body, data)).filter(Boolean);
            const base = Object.assign(mergeWishes(Object.assign({}, wish, { type: undefined }), prevW.map(w => Object.assign({}, w, { type: undefined }))), { type: undefined, more: false });
            const two = pairTypes.slice(0, 2).flatMap(t => pickProducts(Object.assign({}, base, { type: t }), data, now, 0).items.slice(0, 2));
            if (two.length) {
                return reply(fill(T21[lang].pair, { a: DESC[lang].type[pairTypes[0]], b: DESC[lang].type[pairTypes[1]], brand: base.brand ? " " + base.brand : "" }), {
                    products: two.map(p => ({ slug: p.slug, title: (p.title && (p.title[lang] || p.title.uk)) || p.slug, price: botPriceNow(p, now), url: pageUrl(site, `/p/${p.slug}/`, lang), preOrder: Boolean(p.preOrder || !p.inStock) })),
                    chips: [L.chips.more[1]], intent: "products"
                });
            }
        }

        // Попередні запити цієї розмови — щоб «до 5000» доповнило
        // «сумку», а не шукало все дешевше п'яти тисяч.
        const previous = (history || []).filter(m => m && m.author === "visitor").slice(-CONTEXT_MESSAGES).reverse()
            .map(m => parseWish(m.body, data)).filter(Boolean);
        wish = mergeWishes(wish, previous);
        if (!wish.type && !wish.all) {
            const seen = shownType(history, data);
            const named = (history || []).filter(m => m && m.author === "visitor").slice(-8)
                .some(m => (parseWish(m.body, data) || {}).type === seen);
            if (seen && named) wish.type = seen;
        }
        // «А гаманець до неї?» — той самий бренд, що й у попередньому запиті.
        if (!wish.brand && hasStem(list, ["до неї", "до нього", "до неё", "к ней", "к нему", "під неї", "під нього", "под нее", "под неё", "в комплект", "в пару", "to match", "matching", "same brand", "того ж бренду", "того же бренда"])) {
            const prevBrand = previous.map(w => w.brand).find(Boolean);
            if (prevBrand) { wish.brand = prevBrand; wish.criteria = (wish.criteria || 0) + 1; }
        }

        // «Інші варіанти»: скільки разів поспіль людина вже просила ще.
        // Лише її повідомлення — відповіді бота між ними не рахуються.
        // «Сумка» → «сумка» → «сумка»: людина не бачить того, що шукає, —
        // показуємо далі, а не ту саму четвірку.
        const same = b => normalizeText(b) === normalizeText(text);
        const visitorPrev = (history || []).filter(m => m && m.author === "visitor").reverse();
        const byRepeat = !wish.more && visitorPrev.length > 0 && same(visitorPrev[0].body);
        if (byRepeat) wish.more = true;
        // Скільки разів поспіль уже гортали: «ще» або повтор попереднього
        // запиту («сумка» → «сумка» — це теж «покажи далі»). Перший запит
        // ряду — сам запит, не крок.
        let pages = 0;
        if (wish.more) {
            for (let i = 0; i < visitorPrev.length; i++) {
                const m = visitorPrev[i];
                const repeat = i + 1 < visitorPrev.length && normalizeText(m.body) === normalizeText(visitorPrev[i + 1].body);
                if ((parseWish(m.body, data) || {}).more || repeat) pages += 1; else break;
            }
        }
        const offset = wish.more ? (pages + 1) * MAX_PRODUCTS : 0;

        if (!wish.criteria && !wish.fresh && !wish.sale && !wish.gift && !wish.recommend && !wish.cheap && !wish.pricey) {
            return reply(L.askWhat, { chips: L.chips.types, intent: "ask" });
        }

        const picked = pickProducts(wish, data, now, offset);

        // «Ще», а більше нічого: pickProducts повертає з початку — тоді
        // чесно «це всі», а не та сама підбірка вдруге.
        if (wish.more && offset > 0 && picked.start === 0 && picked.total <= offset) {
            const d0 = describeWish(Object.assign({}, wish, { more: false }), lang);
            return reply(fill(T17[lang].noMore, { desc: d0, n: picked.total, variants: plural(picked.total, T5[lang].variants, lang) }), { chips: L.chips.types.slice(0, 4).concat(L.chips.more[1]), intent: "products" });
        }

        if (!picked.items.length && wish.style) {
            const st = STYLES.find(x => x.key === wish.style);
            const other = pickProducts(Object.assign({}, wish, { style: undefined }), data, now, 0);
            if (st && other.items.length) {
                // Після «немає» — родовий відмінок: «рюкзаків», а не «рюкзаки».
                const what = (st.none && st.none[lang]) || st.name[lang];
                return reply(fill(T11[lang].noStyle, { What: what.charAt(0).toUpperCase() + what.slice(1), others: DESC[lang].type[wish.type] || DESC[lang].type.bags }), {
                    products: other.items.map(p => ({
                        slug: p.slug, title: (p.title && (p.title[lang] || p.title.uk)) || p.slug, price: botPriceNow(p, now),
                        url: pageUrl(site, `/p/${p.slug}/`, lang), preOrder: Boolean(p.preOrder || !p.inStock)
                    })), chips: [L.chips.more[1]], intent: "missing"
                });
            }
        }

        if (!picked.items.length && wish.size) {
            // «40-й є?», а сорокового немає: які розміри Є — одразу.
            const sizes = new Set();
            (data.products || []).filter(p => matches(p, Object.assign({}, wish, { size: undefined }), now, {}))
                .forEach(p => ((p.details && p.details.variants) || []).forEach(v => (v.sizes || []).forEach(x => { if (/^\d/.test(String(x.size))) sizes.add(String(x.size)); })));
            const list = [...sizes].sort((a, b) => Number(a) - Number(b));
            if (list.length) {
                const halfSize = /\.5$/.test(String(wish.size));
                return reply(fill(halfSize ? T22[lang].noHalf : T6[lang].noSize, { size: halfSize ? String(wish.size).replace(".", lang === "en" ? "." : ",") : wish.size, list: list.join(", ") }), {
                    chips: list.slice(0, 5).map(x => fill(T6[lang].sizeChip, { size: x })).concat(L.chips.more[1]),
                    intent: "products"
                });
            }
        }

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
                        chips: [L.chips.more[1]],
                        intent: "products"
                    });
                }
            }
            // «Чоловічі кросівки», а кросівки є лише жіночі: так і сказати,
            // а не загальне «такого немає».
            if (wish.gender && wish.type && GENDER_WORDS.gen[wish.gender]) {
                const ofType = (data.products || []).filter(p => matches(p, { type: wish.type }, now, {}));
                const ofGender = ofType.filter(p => matches(p, { type: wish.type, gender: wish.gender }, now, {}));
                const otherG = Object.keys(GENDER_WORDS.nom).find(g => g !== wish.gender && ofType.some(p => (p.gender || []).includes(g)));
                if (ofType.length && !ofGender.length && otherG) {
                    const typeNom = DESC[lang].type[wish.type];
                    const genWord = lang === "en" ? GENDER_WORDS.gen[wish.gender].en + " " + typeNom
                        : GENDER_WORDS.gen[wish.gender][lang] + " " + String(TYPE_WORDS[lang][wish.type] || "").toLowerCase();
                    return reply(fill(T18[lang].noGender, {
                        Type: typeNom.charAt(0).toUpperCase() + typeNom.slice(1), type: typeNom,
                        others: GENDER_WORDS.nom[otherG][lang], gen: genWord, url: pageUrl(site, "/bayer-service", lang)
                    }), { chips: L.chips.types.slice(0, 4), handoff: true, pause: false, intent: "missing" });
                }
            }
            return reply(L.nothing, { handoff: true, pause: false, intent: "handoff" });
        }

        // Заголовок словами людини: «Ось чорні сумки, які є зараз 👇».
        const T5L = T5[lang];
        const desc = describeWish(wish, lang);
        // Порада: «Годинники: ось що радимо зараз…» — опис спереду, щоб
        // не відмінювати його («серед годинників» / «з сумок»).
        const recWhat = (wish.type || wish.brand || wish.gender || wish.budget)
            ? describeWish(Object.assign({}, wish, { recommend: false }), lang) : "";
        const recHead = recWhat
            ? fill(T15[lang].recommend, { what: recWhat.charAt(0).toUpperCase() + recWhat.slice(1) + ": " })
            : (s => s.charAt(0).toUpperCase() + s.slice(1))(fill(T15[lang].recommend, { what: "" }));
        const head = wish.recommend && !picked.relaxed && picked.start === 0 ? recHead
            : picked.relaxed ? (() => {
                const keys = picked.loosened || [];
                const shownWish = Object.assign({}, wish, { more: false });
                keys.forEach(k => { shownWish[k] = undefined; });
                const shown = describeWish(shownWish, lang);
                if (!keys.length || !shown) return L.relaxed;
                return fill(T19[lang].relaxed, { desc: describeWish(Object.assign({}, wish, { more: false }), lang), shown, tail: keys.includes("budget") ? T19[lang].cheapest : "" });
            })()
            : picked.start > 0 ? fill(T5L.hereMore, { desc, from: picked.start + 1, to: picked.start + picked.items.length, total: picked.total })
                : picked.total > MAX_PRODUCTS ? fill(T5L.hereMany, { desc, total: picked.total, k: picked.items.length, variants: plural(picked.total, T5L.variants, lang) })
                    : fill(T5L.here, { desc });

        const chips = [];
        // Широкий запит («сумка» — 48 варіантів): найкорисніше уточнення —
        // для кого. Кнопки — повні фрази, які бот і так розуміє.
        if (wish.type === "bags" && !wish.gender && picked.total > MAX_PRODUCTS * 2) chips.push(L.chips.types[0], L.chips.types[1]);
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

        const notes = [];
        if (wish.foreign) notes.push(T22[lang].currency);
        if (wish.usSize && wish.type === "sneakers") {
            const eu = [...new Set((data.products || []).filter(p => matches(p, { type: "sneakers" }, now, {})).flatMap(p => ((p.details && p.details.variants) || []).flatMap(v => (v.sizes || []).map(x => String(x.size)))).filter(x => /^(3[3-9]|4[0-6])(\.5)?$/.test(x)))].sort((a, b) => Number(a) - Number(b));
            notes.push(fill(T22[lang].usSize, { list: eu.join(", ") }));
        }
        // «Чорна сумка і скільки доставка?» — раніше питання губилось.
        const mixed = findTopics(topicText, faq).filter(x => x.item && x.topic.key !== "fake" && !x.topic.always).slice(0, 2);
        const faqPrefix = mixed.length ? mixed.map(x => topicAnswer(x.topic, x.item, list, lang, text)).join("\n\n") + "\n\n" : "";
        return reply(authPrefix + faqPrefix + (notes.length ? notes.join("\n") + "\n" : "") + head, { products, chips: (wish.foreign ? L.chips.budget : []).concat(chips).slice(0, 7), intent: "products" });

    }

    // 6. Слова збіглися з частим питанням, хоч тему не впізнали.
    const loose = faqByWords(text, faq);
    if (loose) {
        return reply(`${loose.a}\n${L.faqMore} ${pageUrl(site, loose.page, lang)}`, { chips: L.chips.menu.slice(0, 5), intent: "faq" });
    }

    // 6а. Латинська назва після бренду («а Wayfarer?») — моделі в каталозі
    // немає: так і сказати й показати бренд, а не «не зрозумів».
    {
        const bare = String(text).replace(/^\s*(а|і|и|and|or)\s+/i, "").replace(/[?!.,]/g, "").trim();
        if (/^[a-z][a-z0-9 '-]{2,30}$/i.test(bare) && bare.split(/\s+/).length <= 3 && !/\b(i|i'm|can't|cannot|you|we|it|is|are|am|which|what|would|should|could|decide|recommend|help|please|thanks|thank|yes|no|not|like|love|want|need|have|the|this|that|ok|okay|hi|hello|bye)\b/i.test(bare)) {
            const prevW = (history || []).filter(m => m && m.author === "visitor").slice(-CONTEXT_MESSAGES).reverse().map(m => parseWish(m.body, data)).filter(Boolean);
            const prevBrand = prevW.map(w => w.brand).find(Boolean);
            if (prevBrand) {
                const mw = { brand: prevBrand, type: prevW.map(w => w.type).find(Boolean), criteria: 1 };
                const alt = pickProducts(mw, data, now, 0);
                if (alt.items.length) {
                    return reply(fill(T23[lang].noModel, { model: bare, desc: describeWish(mw, lang) }), {
                        products: alt.items.map(p => ({ slug: p.slug, title: (p.title && (p.title[lang] || p.title.uk)) || p.slug, price: botPriceNow(p, now), url: pageUrl(site, `/p/${p.slug}/`, lang), preOrder: Boolean(p.preOrder || !p.inStock) })),
                        chips: [L.chips.more[1]], intent: "products"
                    });
                }
            }
        }
    }

    // 7. Не зрозумів — чесно кажемо й передаємо людині.
    return reply(fill(L.unknown, { hours }), { handoff: true, pause: false, chips: L.chips.menu.slice(0, 3), intent: "unknown" });

}

// ── Запис у базу й показ у Telegram ────────────────────────────────

export function serializeBotReply(reply, lang) {
    const L = T[botLang(lang)];
    const lines = [String(reply.text || "")];
    (reply.products || []).forEach(p => {
        lines.push(`• ${p.title} — ${botMoney(p.price)}${p.preOrder ? " (" + L.preorder + ")" : ""} ${p.url}`);
    });
    if (reply.chips && reply.chips.length) lines.push(`[[chips: ${reply.chips.join(" | ")}]]`);
    if (reply.handoff && reply.pause !== false) lines.push("[[handoff]]");
    else if (reply.handoff) lines.push("[[notify]]");
    // Про яку річ щойно говорили — щоб «а розміри?» далі стосувалось її.
    if (reply.focus) lines.push(`[[focus: ${reply.focus}]]`);
    // Підсумок для власника (див. ownerSummary) — клієнт службові рядки не показує.
    if (reply.summary) lines.push(`[[summary: ${String(reply.summary).replace(/\]\]/g, "] ]").replace(/\n/g, " ")}]]`);
    // Бот не зрозумів — власнику підказка «навчіть бота».
    if (reply.intent === "unknown") lines.push("[[unknown]]");
    if (reply.intent === "unknown" && reply.keys && reply.keys.length) lines.push(`[[keys: ${reply.keys.join(", ").replace(/\]\]/g, "")}]]`);
    return lines.join("\n");
}

// Для власника в Telegram: без службових рядків.
// Ключові слова для автовідповіді з питання, якого бот не зрозумів:
// значущі слова, укорочені до основи (у автовідповідях «досить початку
// слова»), без службових. До трьох.
const KEY_STOP = new Set(["зробити", "зробіть", "робите", "робити", "зробите", "сделать", "сделаете", "делаете", "делать", "offer", "provide", "make", "made", "get", "give", "дати", "дайте", "дать", "знаю", "знати", "знать", "know", "буду", "було", "было", "що", "як", "чи", "де", "коли", "скільки", "можна", "можете", "можна", "мені", "мене", "вас", "вам", "ваш", "ваша", "ваші", "у", "в", "є", "а", "і", "й", "та", "або", "це", "ця", "цей", "ці", "той", "так", "ні", "не", "ще", "вже", "дуже", "будь", "ласка", "підкажіть", "скажіть", "хочу", "треба", "потрібно", "потрібен", "потрібна", "добрий", "день", "привіт", "дякую", "буде", "будь-ласка", "что", "как", "где", "когда", "сколько", "можно", "мне", "меня", "вас", "вам", "ваш", "есть", "это", "этот", "эта", "или", "ещё", "еще", "уже", "очень", "пожалуйста", "подскажите", "скажите", "хочу", "нужно", "нужен", "нужна", "здравствуйте", "привет", "спасибо", "будет", "the", "is", "are", "do", "does", "you", "your", "have", "has", "can", "could", "would", "will", "what", "how", "when", "where", "which", "any", "for", "with", "and", "or", "not", "please", "hello", "thanks", "there", "this", "that", "it", "i", "me", "my", "a", "an", "to", "of", "in", "on", "at", "be"]);
export function suggestKeys(text) {
    const out = [];
    for (const w of words(text)) {
        if (w.length < 4 || KEY_STOP.has(w) || /^\d+$/.test(w) || /[^\p{L}'ʼ-]/u.test(w)) continue;
        const stem = /^[a-z]/.test(w) ? w.slice(0, Math.max(4, w.length - (w.length > 6 ? 2 : 0))) : w.slice(0, Math.max(4, w.length - (w.length > 5 ? 2 : 1)));
        if (!out.includes(stem)) out.push(stem);
        if (out.length === 3) break;
    }
    return out;
}

export function botTelegramText(body, threadNo, escape) {
    const esc = typeof escape === "function" ? escape : (s => s);
    const clean = String(body || "").split("\n").filter(l => !/^\[\[.*\]\]$/.test(l.trim())).join("\n");
    const handoff = /\[\[handoff\]\]/.test(String(body || ""));
    const notify = /\[\[notify\]\]/.test(String(body || ""));
    const summary = (String(body || "").match(/^\[\[summary: (.*)\]\]$/m) || [])[1];
    return `🤖 <b>Бот відповів</b>${threadNo ? ` · розмова #${threadNo}` : ""}\n\n${esc(clean)}`
        + (handoff ? "\n\n⚠️ <b>Бот передав розмову вам</b> — відповідайте реплаєм на повідомлення покупця." : "")
        + (notify ? "\n\n⚠️ <b>Потрібна ваша відповідь</b> — бот і далі відповідає в розмові, поки ви не напишете." : "")
        + (summary && (handoff || notify) ? `\n${esc(summary)}` : "")
        // Питання, якого бот не знає, — найкращий матеріал, щоб його
        // навчити: власник бачить його саме тут.
        + (/\[\[unknown\]\]/.test(String(body || "")) ? "\n💡 Щоб бот відповідав на таке сам — адмінка → «Автовідповіді бота в чаті»." : "")
        + ((m => m ? `\n🔑 Ключові слова для автовідповіді: ${m[1].split(", ").map(k => "«" + esc(k) + "»").join(", ")}` : "")(String(body || "").match(/^\[\[keys: (.+)\]\]$/m)));
}
