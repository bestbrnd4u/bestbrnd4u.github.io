// -------------------------
// Спливаюче вікно акції (поп-ап)
//
// Використовується на сторінках з каталогом (catalog.html,
// promo.html) — підключається окремим <script> і викликається
// через initPromoPopup("catalog") / initPromoPopup("promo").
//
// Дані беруться з тих самих акцій, що й інші банери (data/
// promotions.json), тільки з displayType:"popup" і полем
// popupPages, яке керується з адмінки — там же обирається,
// на яких сторінках цей конкретний поп-ап показувати.
//
// Показуємо щонайбільше один поп-ап (перший за полем order серед
// підхожих) один раз через ~хвилину після відкриття сторінки.
// Якщо відвідувач його закрив (хрестиком, кліком по фону, Esc
// або перейшовши по самому банеру) — більше не показуємо йому
// САМЕ ЦЕЙ поп-ап (позначка триває, поки не очистять дані сайту
// в браузері — не прив'язана до однієї вкладки чи дня).
// -------------------------

const PROMO_POPUP_DELAY_MS = 60000;

async function initPromoPopup(pageType) {

    let promotions;

    try {

        const response = await fetch("data/promotions.json");
        promotions = await response.json();

    } catch (error) {

        console.error(error);
        return;

    }

    const promo = promotions
        .filter(item =>
            item.displayType === "popup" &&
            item.popupImage &&
            Array.isArray(item.popupPages) &&
            item.popupPages.includes(pageType)
        )
        .sort((a, b) => a.order - b.order)[0];

    if (!promo) return;

    const dismissKey = `promoPopupDismissed:${promo.slug}`;

    if (localStorage.getItem(dismissKey)) return;

    setTimeout(() => {

        // відвідувач міг уже піти зі сторінки за цю хвилину —
        // не показуємо поп-ап у вкладку, яку ніхто не бачить
        if (!document.hidden) showPromoPopup(promo, dismissKey);

    }, PROMO_POPUP_DELAY_MS);

}

function showPromoPopup(promo, dismissKey) {

    const backdrop = document.createElement("div");

    backdrop.className = "promo-popup-backdrop";

    const popup = document.createElement("div");

    popup.className = "promo-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", promo.title);

    popup.innerHTML = `
        <button type="button" class="promo-popup-close" aria-label="Закрити">✕</button>
        <a href="promo?id=${encodeURIComponent(promo.slug)}" class="promo-popup-image-link">
            <img
                src="${promo.popupImage}"
                alt="${promo.title}"
                onerror="this.src='assets/images/no-image.png'">
            <div class="promo-popup-overlay">
                ${promo.badge ? `<span class="promo-popup-badge">${promo.badge}</span>` : ""}
                <h3>${promo.title}</h3>
                ${promo.text ? `<p>${promo.text}</p>` : ""}
            </div>
        </a>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(popup);
    lockPageScroll();

    // клас додаємо в наступному кадрі, щоб transition відпрацював
    // (елемент має спочатку відрендеритись у "закритому" стані)
    requestAnimationFrame(() => {

        backdrop.classList.add("open");
        popup.classList.add("open");

    });

    function dismiss() {

        localStorage.setItem(dismissKey, "1");

        backdrop.classList.remove("open");
        popup.classList.remove("open");
        unlockPageScroll();

        document.removeEventListener("keydown", onKeyDown);

        setTimeout(() => {

            backdrop.remove();
            popup.remove();

        }, 300);

    }

    function onKeyDown(event) {

        if (event.key === "Escape") dismiss();

    }

    backdrop.addEventListener("click", dismiss);
    popup.querySelector(".promo-popup-close").addEventListener("click", dismiss);

    // клік по самому банеру теж рахуємо за "закрив" — навіщо ще
    // раз пропонувати той самий поп-ап людині, яка вже перейшла
    // дивитись акцію
    popup.querySelector(".promo-popup-image-link").addEventListener("click", () => {

        localStorage.setItem(dismissKey, "1");

    });

    document.addEventListener("keydown", onKeyDown);

}
