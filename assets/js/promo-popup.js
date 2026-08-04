// ======================================
// promo-popup.js
// Спливаючий банер акції (як на md-fashion.ua) — з'являється в
// кутку екрана через N секунд після відкриття сторінки, і лише
// якщо відвідувач раніше не закривав саме цей банер.
//
// Керується з адмінки: розділ «Спливаючі банери» — там же
// вказується, на яких сторінках (Каталог / Сторінка акції /
// Головна) показувати кожен банер.
//
// Підключається на index.html, catalog.html, promo.html.
// ======================================

(function () {

    const CURRENT_PAGE = document.body.dataset.popupPage;

    if (!CURRENT_PAGE) return;

    const DISMISS_KEY_PREFIX = "bagveroPopupDismissed:";

    async function initPromoPopup() {

        try {

            const response = await fetch("data/promo-popups.json");

            if (!response.ok) return;

            const popups = await response.json();

            if (!Array.isArray(popups) || popups.length === 0) return;

            const eligible = popups.find(popup =>
                popup.pages.includes(CURRENT_PAGE) &&
                !localStorage.getItem(DISMISS_KEY_PREFIX + popup.slug)
            );

            if (!eligible) return;

            const delayMs = (eligible.delaySeconds || 60) * 1000;

            setTimeout(() => showPromoPopup(eligible), delayMs);

        } catch (error) {

            console.warn("Не вдалося завантажити спливаючий банер:", error);

        }

    }

    function showPromoPopup(popup) {

        // якщо відвідувач вже пішов зі сторінки (SPA-подібна навігація
        // тут не використовується, але про всяк випадок) — не показуємо
        if (document.hidden) return;

        const wrapper = document.createElement("div");
        wrapper.className = "promo-popup";
        wrapper.innerHTML = `
            <button type="button" class="promo-popup-close" aria-label="Закрити">✕</button>
            <a href="promo?id=${encodeURIComponent(popup.promoSlug)}" class="promo-popup-link">
                <img src="${popup.image}" alt="" loading="lazy">
            </a>
        `;

        document.body.appendChild(wrapper);

        requestAnimationFrame(() => wrapper.classList.add("is-visible"));

        function dismiss() {

            localStorage.setItem(DISMISS_KEY_PREFIX + popup.slug, "1");

            wrapper.classList.remove("is-visible");

            setTimeout(() => wrapper.remove(), 300);

        }

        wrapper.querySelector(".promo-popup-close").addEventListener("click", event => {

            event.preventDefault();
            event.stopPropagation();

            dismiss();

        });

        // клік по самому банеру теж рахуємо як "закрито" —
        // повторно на цій сторінці більше не спливе
        wrapper.querySelector(".promo-popup-link").addEventListener("click", () => {

            localStorage.setItem(DISMISS_KEY_PREFIX + popup.slug, "1");

        });

    }

    initPromoPopup();

})();
