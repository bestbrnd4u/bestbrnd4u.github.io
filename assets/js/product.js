const params = new URLSearchParams(location.search);

const productId = Number(params.get("id"));

let products=[];

async function init(){

const response=await fetch("data/products.json");

products=await response.json();

const product=products.find(p=>p.id===productId);

if(!product){

document.getElementById("productPage").innerHTML="<h2>Товар не знайдено</h2>";

return;

}

renderProduct(product);

renderSimilar(product);

updateFavoriteButtons();

}

function renderProduct(product) {

    document.getElementById("breadTitle").textContent = product.title;

    const variants = product.variants?.length
        ? product.variants
        : [{ color: product.color || "Основний", hex: "#999", images: product.images || [] }];

    const activeVariant = variants[0];
    const galleryImages = activeVariant.images?.length ? activeVariant.images : (product.images || []);

    const colorButtons = variants.map((variant, index) => {

        const swatchImage = variant.images?.[0];

        const swatchStyle = swatchImage
            ? `background-image:url('${swatchImage}')`
            : `background-color:${variant.hex || "#999"}`;

        return `
        <button
            class="color ${index === 0 ? "active" : ""}"
            data-color="${variant.color}"
            data-images='${JSON.stringify(variant.images || [])}'
            title="${variant.color}"
            aria-label="Колір: ${variant.color}"
            style="${swatchStyle}"></button>
    `;

    }).join("");

    document.getElementById("productPage").innerHTML = `

<div class="product-wrapper">

    <div class="product-gallery">

    <div class="thumbs-vertical" id="thumbsVertical">

        ${galleryImages.map((img,index)=>`

            <img
                src="${img}"
                class="thumb ${index===0?"active":""}"
                alt="${product.title}">

        `).join("")}

    </div>

    <div class="main-photo">

        ${product.badge ? `<span class="product-badge">${product.badge}</span>` : ""}

        <div class="zoom-container">

            <img
                id="mainImage"
                src="${galleryImages[0] || "assets/images/no-image.png"}"
                alt="${product.title}">

        </div>

    </div>

</div>

    <div class="product-info">

        <div class="brand">

            ${product.brand}

        </div>

        <h1>

            ${product.title}

        </h1>

        <div class="price-box">

            <span class="old-price">

                ${product.oldPrice ? formatPrice(product.oldPrice) : ""}

            </span>

            <span class="price">

                ${formatPrice(product.price)}

            </span>

        </div>
        <div class="option-group">

    <label>Колір: <span id="selectedColorLabel">${activeVariant.color}</span></label>

    <div class="color-options">

        ${colorButtons}

    </div>

</div>
<div class="option-group">

<label>Розмір</label>

<div class="sizes">

<button class="size active">

S

</button>

<button class="size">

M

</button>

<button class="size">

L

</button>

</div>

</div>

        <div class="product-short">

            ${product.description || "Стильна сумка преміальної якості. Підходить для щоденного використання та чудово поєднується з будь-яким образом."}

        </div>

        <div class="product-actions">

            <button
                class="btn buy-btn"
                data-id="${product.id}">

                🛒 Купити

            </button>

            <button
                class="favorite-btn favorite"
                data-id="${product.id}"
                title="До обраного"
                aria-label="Додати в обране">

                <svg class="favorite-btn-icon" viewBox="0 0 24 24">
                    <path d="M12 21s-6.7-4.4-9.3-8.3C.9 9.6 1.7 5.9 5.1 4.9c2-.6 4 .2 5.2 1.9l1.7 2.3 1.7-2.3c1.2-1.7 3.2-2.5 5.2-1.9 3.4 1 4.2 4.7 2.4 7.8C18.7 16.6 12 21 12 21z"/>
                </svg>

                <span class="favorite-indicator">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 21s-6.7-4.4-9.3-8.3C.9 9.6 1.7 5.9 5.1 4.9c2-.6 4 .2 5.2 1.9l1.7 2.3 1.7-2.3c1.2-1.7 3.2-2.5 5.2-1.9 3.4 1 4.2 4.7 2.4 7.8C18.7 16.6 12 21 12 21z"/>
                    </svg>
                </span>

            </button>

        </div>

        <div class="delivery-box">

            <div>🚚 Доставка по Україні 1–3 дні</div>

            <div>💳 Оплата при отриманні або онлайн</div>

            <div>↩️ Повернення протягом 14 днів</div>

        </div>

        <div class="specifications">

            ${product.sku ? `
            <div class="spec-block">
                <h3>Артикул</h3>
                <p class="spec-plain">${product.sku}</p>
            </div>` : ""}

            <div class="spec-block">

                <h3>Інформація про товар</h3>

                <div class="spec-row" id="specColorRow">
                    <span>Колір</span>
                    <strong id="specColorValue">${activeVariant.color}</strong>
                </div>

                ${product.closure ? `
                <div class="spec-row">
                    <span>Застібка</span>
                    <strong>${product.closure}</strong>
                </div>` : ""}

                ${product.decor ? `
                <div class="spec-row">
                    <span>Декор</span>
                    <strong>${product.decor}</strong>
                </div>` : ""}

                ${product.dimensions ? `
                <div class="spec-row">
                    <span>Розмір</span>
                    <strong>${product.dimensions}</strong>
                </div>` : ""}

                ${product.strapInfo ? `<p class="spec-plain">${product.strapInfo}</p>` : ""}

                ${product.compartments ? `
                <div class="spec-row">
                    <span>Відділення / кишені (зовнішні)</span>
                    <strong>${product.compartments}</strong>
                </div>` : ""}

                ${product.material ? `
                <div class="spec-row">
                    <span>Матеріал</span>
                    <strong>${product.material}</strong>
                </div>` : ""}

                <div class="spec-row">
                    <span>Бренд</span>
                    <strong>${product.brand}</strong>
                </div>

                <div class="spec-row">
                    <span>Стать</span>
                    <strong>${product.gender || "Унісекс"}</strong>
                </div>

                ${product.country ? `
                <div class="spec-row">
                    <span>Країна</span>
                    <strong>${product.country}</strong>
                </div>` : ""}

            </div>

            ${product.composition ? `
            <div class="spec-block">
                <h3>Склад</h3>
                <div class="spec-row">
                    <span>Склад</span>
                    <strong>${product.composition}</strong>
                </div>
            </div>` : ""}

        </div>

    </div>

</div>

`;

    document.querySelectorAll(".thumb").forEach(thumb => {

        thumb.addEventListener("click", function(){

            document.getElementById("mainImage").src = this.src;

            document.querySelectorAll(".thumb").forEach(i=>i.classList.remove("active"));

            this.classList.add("active");

        });

    });

}

// Викликається з common.js при кліку на колір на сторінці товару —
// повністю перебудовує галерею (мініатюри + головне фото) під
// фотографії обраного кольору.
function updateGalleryForColor(images) {

    if (!images || !images.length) return;

    const thumbsVertical = document.getElementById("thumbsVertical");
    const mainImage = document.getElementById("mainImage");

    if (!thumbsVertical || !mainImage) return;

    thumbsVertical.innerHTML = images.map((img, index) => `
        <img
            src="${img}"
            class="thumb ${index === 0 ? "active" : ""}"
            alt="">
    `).join("");

    mainImage.src = images[0];

    thumbsVertical.querySelectorAll(".thumb").forEach(thumb => {

        thumb.addEventListener("click", function () {

            mainImage.src = this.src;

            thumbsVertical.querySelectorAll(".thumb").forEach(i => i.classList.remove("active"));

            this.classList.add("active");

        });

    });

    // синхронізуємо назву кольору в характеристиках товару
    // і в підписі над мініатюрами ("Колір: ...")
    const colorLabel = document.querySelector(".color.active")?.dataset.color;
    const specColorValue = document.getElementById("specColorValue");
    const selectedColorLabel = document.getElementById("selectedColorLabel");

    if (colorLabel && specColorValue) specColorValue.textContent = colorLabel;
    if (colorLabel && selectedColorLabel) selectedColorLabel.textContent = colorLabel;

}

function renderSimilar(product){

const list=products.filter(item=>

item.id!==product.id

).slice(0,4);

const container=document.getElementById("similarProducts");

container.innerHTML="";

list.forEach(item=>{

container.innerHTML+=createProductCard(item);

});

updateFavoriteButtons();

    document.querySelectorAll(".size").forEach(button=>{

    button.onclick=function(){

        document.querySelectorAll(".size").forEach(item=>item.classList.remove("active"));

        this.classList.add("active");

        updateFavoriteButtons();

    }

});

}

init();
