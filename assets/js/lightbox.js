// =============================================================
// LIGHTBOX — повноекранний перегляд фото товару з зумом
// (пінч / подвійний тап / подвійний клік), панорамуванням
// зображення при наближенні, навігацією стрілками/свайпом/
// клавіатурою і свайпом вниз для закриття.
// За зразком сторінки товару на md-fashion.ua.
// =============================================================

(function () {

    const MAX_SCALE = 4;
    const DOUBLE_TAP_SCALE = 2.5;

    let images = [];
    let index = 0;

    let root = null;
    let track = null;
    let currentEl = null;
    let totalEl = null;

    let scale = 1;
    let tx = 0;
    let ty = 0;

    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    function buildLightbox() {

        const existing = document.getElementById("productLightbox");

        if (existing) return existing;

        const el = document.createElement("div");

        el.id = "productLightbox";
        el.className = "lightbox";
        el.hidden = true;

        el.innerHTML = `
            <button type="button" class="lightbox-close" aria-label="Закрити">
                <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
            <button type="button" class="lightbox-arrow lightbox-prev" aria-label="Попереднє фото">
                <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>
            </button>
            <button type="button" class="lightbox-arrow lightbox-next" aria-label="Наступне фото">
                <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
            </button>
            <div class="lightbox-stage">
                <div class="lightbox-track" id="lightboxTrack"></div>
            </div>
            <div class="lightbox-bottom-bar">
                <button type="button" class="lightbox-arrow lightbox-prev-mobile" aria-label="Попереднє фото">
                    <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>
                </button>
                <div class="lightbox-counter">
                    <span id="lightboxCurrent">1</span><span class="lightbox-counter-total">/<span id="lightboxTotal">1</span></span>
                </div>
                <button type="button" class="lightbox-arrow lightbox-next-mobile" aria-label="Наступне фото">
                    <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
                </button>
            </div>
            <div class="lightbox-hint">Масштабуйте фотографію жестом зведення і розведення пальців</div>
        `;

        document.body.appendChild(el);

        root = el;
        track = el.querySelector("#lightboxTrack");
        currentEl = el.querySelector("#lightboxCurrent");
        totalEl = el.querySelector("#lightboxTotal");

        bindControls();

        return el;

    }

    function renderSlides() {

        track.innerHTML = images.map(src => `
            <div class="lightbox-slide">
                <img class="lightbox-img" src="${src}" alt="" draggable="false">
            </div>
        `).join("");

        totalEl.textContent = images.length;

    }

    function resetZoom() {

        scale = 1;
        tx = 0;
        ty = 0;

        applyTransform();

    }

    function applyTransform(immediate) {

        const slide = track.children[index];
        const img = slide?.querySelector(".lightbox-img");

        if (!img) return;

        img.style.transition = immediate ? "none" : "";
        img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;

        root.classList.toggle("is-zoomed", scale > 1.02);

    }

    function goTo(newIndex, animate) {

        index = Math.max(0, Math.min(newIndex, images.length - 1));

        resetZoom();

        track.style.transition = animate ? "" : "none";
        track.style.transform = `translateX(-${index * 100}%)`;

        if (!animate) {
            // форсуємо reflow, щоб наступні зміни знову анімувались
            void track.offsetHeight;
            track.style.transition = "";
        }

        currentEl.textContent = index + 1;

        [...track.children].forEach((slide, i) => {
            slide.classList.toggle("active", i === index);
        });

        root.querySelectorAll(".lightbox-prev, .lightbox-prev-mobile").forEach(btn => {
            btn.disabled = index === 0;
        });

        root.querySelectorAll(".lightbox-next, .lightbox-next-mobile").forEach(btn => {
            btn.disabled = index === images.length - 1;
        });

    }

    window.openLightbox = function (imageList, startIndex) {

        buildLightbox();

        images = imageList && imageList.length ? imageList : [];

        if (!images.length) return;

        renderSlides();

        root.hidden = false;

        document.body.style.overflow = "hidden";

        goTo(startIndex || 0, false);

        // невелика затримка, щоб transition не зловив початкове позиціювання
        requestAnimationFrame(() => root.classList.add("open"));

    };

    function closeLightbox() {

        root.classList.remove("open");
        root.hidden = true;

        document.body.style.overflow = "";

        resetZoom();

    }

    function bindControls() {

        root.querySelector(".lightbox-close").addEventListener("click", closeLightbox);

        root.addEventListener("click", event => {
            if (event.target === root) closeLightbox();
        });

        root.querySelectorAll(".lightbox-prev, .lightbox-prev-mobile").forEach(btn => {
            btn.addEventListener("click", () => goTo(index - 1, true));
        });

        root.querySelectorAll(".lightbox-next, .lightbox-next-mobile").forEach(btn => {
            btn.addEventListener("click", () => goTo(index + 1, true));
        });

        document.addEventListener("keydown", event => {

            if (root.hidden) return;

            if (event.key === "Escape") closeLightbox();
            if (event.key === "ArrowLeft") goTo(index - 1, true);
            if (event.key === "ArrowRight") goTo(index + 1, true);

        });

        // подвійний клік на десктопі — тогл зуму
        track.addEventListener("dblclick", event => {

            const stageRect = root.querySelector(".lightbox-stage").getBoundingClientRect();

            toggleZoom(event.clientX - stageRect.left - stageRect.width / 2, event.clientY - stageRect.top - stageRect.height / 2);

        });

        bindTouch();

    }

    function toggleZoom(offsetX, offsetY) {

        if (scale > 1) {

            resetZoom();

        } else {

            scale = DOUBLE_TAP_SCALE;
            tx = -offsetX * (scale - 1) / scale;
            ty = -offsetY * (scale - 1) / scale;

            clampPan();
            applyTransform();

        }

    }

    function clampPan() {

        const stage = root.querySelector(".lightbox-stage");
        const rect = stage.getBoundingClientRect();

        const maxTx = Math.max(0, (scale - 1) * rect.width / 2);
        const maxTy = Math.max(0, (scale - 1) * rect.height / 2);

        tx = Math.max(-maxTx, Math.min(maxTx, tx));
        ty = Math.max(-maxTy, Math.min(maxTy, ty));

    }

    function bindTouch() {

        let mode = null; // null | "pinch" | "pan" | "swipe" | "dismiss"
        let axis = null;

        let startX = 0;
        let startY = 0;
        let startTx = 0;
        let startTy = 0;
        let startScale = 1;
        let startDist = 0;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        function dist(touches) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.hypot(dx, dy);
        }

        track.addEventListener("touchstart", event => {

            if (event.touches.length === 2) {

                mode = "pinch";
                startDist = dist(event.touches);
                startScale = scale;

            } else if (event.touches.length === 1) {

                startX = event.touches[0].clientX;
                startY = event.touches[0].clientY;
                startTx = tx;
                startTy = ty;
                axis = null;
                dragOffsetX = 0;
                dragOffsetY = 0;

                mode = scale > 1.02 ? "pan" : null;

                // подвійний тап
                const now = Date.now();

                if (now - lastTapTime < 300
                    && Math.abs(startX - lastTapX) < 30
                    && Math.abs(startY - lastTapY) < 30) {

                    const stageRect = root.querySelector(".lightbox-stage").getBoundingClientRect();

                    toggleZoom(startX - stageRect.left - stageRect.width / 2, startY - stageRect.top - stageRect.height / 2);

                    mode = null;
                    lastTapTime = 0;

                } else {

                    lastTapTime = now;
                    lastTapX = startX;
                    lastTapY = startY;

                }

            }

        }, { passive: true });

        track.addEventListener("touchmove", event => {

            if (mode === "pinch" && event.touches.length === 2) {

                event.preventDefault();

                const newDist = dist(event.touches);

                scale = Math.max(1, Math.min(MAX_SCALE, startScale * (newDist / startDist)));

                clampPan();
                applyTransform(true);

                return;

            }

            if (event.touches.length !== 1) return;

            const dx = event.touches[0].clientX - startX;
            const dy = event.touches[0].clientY - startY;

            if (mode === "pan") {

                event.preventDefault();

                tx = startTx + dx;
                ty = startTy + dy;

                clampPan();
                applyTransform(true);

                return;

            }

            if (mode === null) {

                if (axis === null) {

                    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;

                    axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
                    mode = axis === "x" ? "swipe" : "dismiss";

                }

            }

            if (mode === "swipe") {

                event.preventDefault();

                dragOffsetX = dx;

                track.style.transition = "none";
                track.style.transform = `translateX(calc(-${index * 100}% + ${dx}px))`;

            } else if (mode === "dismiss") {

                if (dy > 0) {

                    dragOffsetY = dy;

                    const progress = Math.min(dy / 300, 1);

                    root.style.opacity = String(1 - progress * .6);
                    track.style.transform = `translateX(-${index * 100}%) translateY(${dy}px)`;

                }

            }

        }, { passive: false });

        track.addEventListener("touchend", () => {

            if (mode === "swipe") {

                track.style.transition = "";

                const threshold = root.querySelector(".lightbox-stage").clientWidth * .18;

                if (dragOffsetX < -threshold && index < images.length - 1) {
                    goTo(index + 1, true);
                } else if (dragOffsetX > threshold && index > 0) {
                    goTo(index - 1, true);
                } else {
                    goTo(index, true);
                }

            } else if (mode === "dismiss") {

                track.style.transition = "";

                if (dragOffsetY > 100) {

                    closeLightbox();

                } else {

                    root.style.opacity = "";
                    track.style.transform = `translateX(-${index * 100}%)`;

                }

            } else if (mode === "pinch" || mode === "pan") {

                if (scale < 1.05) {
                    resetZoom();
                } else {
                    applyTransform();
                }

            }

            mode = null;
            axis = null;

        });

        track.addEventListener("touchcancel", () => {

            mode = null;
            axis = null;

            track.style.transition = "";
            root.style.opacity = "";

        });

    }

})();
