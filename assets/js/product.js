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

    document.getElementById("productPage").innerHTML = `

<div class="product-wrapper">

    <div class="product-gallery">

    <div class="thumbs-vertical">

        ${product.images.map((img,index)=>`

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
                src="${product.images[0]}"
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

        <div class="product-rating">

            ⭐ ${product.rating}
            <span>(${product.reviews} відгуків)</span>

        </div>

        <div class="price-box">

            <span class="old-price">

                ${product.oldPrice ? formatPrice(product.oldPrice) : ""}

            </span>

            <span class="price">

                ${formatPrice(product.price)}

            </span>

        </div>
        <div class="option-group">

    <label>Колір</label>

    <div class="color-options">

        <button class="color active" data-color="Чорний" title="Чорний" style="background:#000"></button>

        <button class="color" data-color="Коричневий" title="Коричневий" style="background:#8b5e3c"></button>

        <button class="color" data-color="Бежевий" title="Бежевий" style="background:#d9c7a1"></button>

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

                ❤

            </button>

        </div>

        <div class="delivery-box">

            <div>🚚 Доставка по Україні 1–3 дні</div>

            <div>💳 Оплата при отриманні або онлайн</div>

            <div>↩️ Повернення протягом 14 днів</div>

        </div>

        <div class="specifications">

            <h3>Характеристики</h3>

            <div class="spec-row">
                <span>Матеріал</span>
                <strong>${product.material || "Екошкіра"}</strong>
            </div>

            <div class="spec-row">
                <span>Колір</span>
                <strong>${product.color || "Чорний"}</strong>
            </div>

            <div class="spec-row">
                <span>Країна</span>
                <strong>${product.country || "Італія"}</strong>
            </div>

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

function renderSimilar(product){

const list=products.filter(item=>

item.id!==product.id

).slice(0,4);

const container=document.getElementById("similarProducts");

container.innerHTML="";

list.forEach(item=>{

container.innerHTML+=createProductCard(item);

});
    document.querySelectorAll(".color").forEach(button=>{

    button.onclick=function(){

        document.querySelectorAll(".color").forEach(item=>item.classList.remove("active"));

        this.classList.add("active");

    }

});

document.querySelectorAll(".size").forEach(button=>{

    button.onclick=function(){

        document.querySelectorAll(".size").forEach(item=>item.classList.remove("active"));

        this.classList.add("active");

    }

});

}

init();
