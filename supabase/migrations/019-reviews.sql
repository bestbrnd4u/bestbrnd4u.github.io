-- ======================================
-- Відгуки про товар
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- У 73 товарах зі 100 стоїть рейтинг, а відгуків немає ні в одного.
-- Тому розмітка для Google свідомо ховає aggregateRating: рейтинг без
-- жодного відгуку — пряма причина ручних санкцій, і краще не мати
-- зірок, ніж мати вигадані.
--
-- Наслідок: у пошуку немає зірок ні в кого. А зірки в сніпеті — це
-- приріст кліків на тій самій позиції, без жодних грошей за рекламу.
--
-- І друге, важливіше за SEO: на полиці 3 000-15 000 ₴ із логотипами
-- Gucci й Prada головне заперечення покупця — «чи це не підробка».
-- Відгук іншого покупця відповідає на це переконливіше, ніж будь-який
-- текст магазину.
-- --------------------------------------


-- --------------------------------------
-- ГОЛОВНЕ ПРАВИЛО: ВІДГУК ЛИШЕ ВІД ТОГО, ХТО КУПУВАВ
--
-- Форма без перевірки покупки — це запрошення для конкурентів і
-- ботів. Тому відгук приймається тільки разом із номером замовлення
-- й телефоном, і функція Edge звіряє:
--
--   • замовлення з таким номером існує;
--   • телефон збігається (останні 9 цифр — див. order-lookup.js);
--   • цей товар справді є в його складі.
--
-- Перевірку робить функція службовим ключем, а не браузер: у браузері
-- будь-яка така перевірка нічого не варта.
--
-- Саме тому тут НЕМА функції додавання для anon. Браузер не пише в цю
-- таблицю взагалі — він просить функцію.
-- --------------------------------------

create table if not exists public.reviews (

    id           bigserial   primary key,

    -- Товар. Без зовнішнього ключа навмисно: товари живуть у
    -- репозиторії, а не в базі, тож посилатись нема на що.
    product_id   bigint      not null,

    -- Чиє це замовлення. Потрібно, щоб той самий покупець не написав
    -- десять відгуків на один товар, і щоб можна було знайти, про яку
    -- саме покупку йдеться.
    order_number text        not null,

    author       text        not null,
    rating       smallint    not null check (rating between 1 and 5),
    body         text        not null,

    -- new → published або rejected. Показуються ЛИШЕ published:
    -- відгук, який з'являється на сайті сам, рано чи пізно принесе
    -- або спам, або чужу лайку.
    status       text        not null default 'new'
                             check (status in ('new', 'published', 'rejected')),

    -- Відповідь магазину. Показується під відгуком.
    reply        text,

    created_at   timestamptz not null default now()
);

create index if not exists reviews_product_idx
    on public.reviews (product_id, status, created_at desc);

-- Один покупець — один відгук на товар. Друге надсилання не створює
-- дубль, а оновлює наявний (див. add_review нижче).
create unique index if not exists reviews_one_per_order_idx
    on public.reviews (product_id, order_number);

-- RLS увімкнено, політик немає — тобто таблиця закрита для всіх, крім
-- службового ключа. Читати опубліковані відгуки браузер буде через
-- функцію нижче, а не напряму: інакше публічним ключем можна було б
-- вивантажити й невідмодеровані.
alter table public.reviews enable row level security;


-- --------------------------------------
-- ЧИТАННЯ: ЛИШЕ ОПУБЛІКОВАНІ
--
-- Віддаємо рівно те, що можна показати. Ні order_number, ні id
-- замовлення, ні статусу — той самий білий список, що на сторінці
-- «Де моє замовлення».
-- --------------------------------------

create or replace function public.product_reviews(p_product_id bigint)
returns table (
    author     text,
    rating     smallint,
    body       text,
    reply      text,
    created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
    select r.author, r.rating, r.body, r.reply, r.created_at
      from public.reviews r
     where r.product_id = p_product_id
       and r.status = 'published'
     order by r.created_at desc
     limit 50;
$$;

grant execute on function public.product_reviews(bigint) to anon, authenticated;


-- --------------------------------------
-- ЗВЕДЕННЯ ДЛЯ РОЗМІТКИ
--
-- Скільки відгуків і яка середня оцінка в кожного товару. Це читає
-- збірка сайту (scripts/pull-reviews.js) і кладе в дані товару —
-- звідти число потрапляє в aggregateRating.
--
-- ЧОМУ НЕ ДЛЯ БРАУЗЕРА. Розмітка мусить бути в HTML на момент, коли
-- сторінку читає Google, а не з'являтись після запиту в базу.
-- --------------------------------------

create or replace function public.review_stats()
returns table (
    product_id bigint,
    reviews    integer,
    rating     numeric
)
language sql
security definer
set search_path = public
stable
as $$
    select r.product_id,
           count(*)::integer,
           -- Одна цифра після коми: більше Google однаково не показує,
           -- а «4.6666666» у розмітці виглядає як помилка.
           round(avg(r.rating)::numeric, 1)
      from public.reviews r
     where r.status = 'published'
     group by r.product_id;
$$;

revoke all on function public.review_stats() from public;
revoke all on function public.review_stats() from anon, authenticated;
grant execute on function public.review_stats() to service_role;


-- --------------------------------------
-- ДОДАВАННЯ
--
-- Кличе ЛИШЕ функція Edge службовим ключем — вона перед цим звіряє
-- телефон і склад замовлення. Тут перевіряємо те, що можна перевірити
-- в базі: оцінка в межах, текст не порожній, замовлення існує.
--
-- Повертає id відгуку або null, якщо не прийнято.
-- --------------------------------------

create or replace function public.add_review(
    p_product_id   bigint,
    p_order_number text,
    p_author       text,
    p_rating       smallint,
    p_body         text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_author text;
    v_body   text;
    v_id     bigint;
begin

    if p_rating is null or p_rating < 1 or p_rating > 5 then
        return null;
    end if;

    v_author := left(btrim(coalesce(p_author, '')), 80);
    v_body   := left(btrim(coalesce(p_body, '')), 2000);

    if v_author = '' or v_body = '' then
        return null;
    end if;

    -- Замовлення мусить існувати. Головну перевірку (телефон і склад)
    -- уже зробила функція Edge, але покладатись на неї одну не варто:
    -- ця межа працює незалежно від того, звідки прийшов виклик.
    if not exists (
        select 1 from public.orders
         where order_number = p_order_number
    ) then
        return null;
    end if;

    -- Друге надсилання того самого покупця про той самий товар — це
    -- виправлення, а не другий відгук. Статус скидається в 'new':
    -- переписаний текст мусить пройти модерацію заново.
    insert into public.reviews (product_id, order_number, author, rating, body, status)
    values (p_product_id, p_order_number, v_author, p_rating, v_body, 'new')
    on conflict (product_id, order_number) do update
        set author     = excluded.author,
            rating     = excluded.rating,
            body       = excluded.body,
            status     = 'new',
            created_at = now()
    returning id into v_id;

    return v_id;

end;
$$;

revoke all on function public.add_review(bigint, text, text, smallint, text) from public;
revoke all on function public.add_review(bigint, text, text, smallint, text) from anon, authenticated;
grant execute on function public.add_review(bigint, text, text, smallint, text) to service_role;


-- --------------------------------------
-- КОМУ ЩЕ ПРОСИТИ ВІДГУК
--
-- Замовлення, які виконані понад тиждень тому, мають пошту й ще не
-- отримували прохання. Тиждень — щоб посилка встигла дійти й людина
-- встигла нею скористатись.
--
-- Читає scripts/request-reviews.js службовим ключем.
-- --------------------------------------

create table if not exists public.review_requests (

    order_number text        primary key,

    sent_at      timestamptz not null default now()
);

alter table public.review_requests enable row level security;

create or replace function public.review_candidates(p_days integer default 7, p_limit integer default 20)
returns table (
    order_number text,
    email        text,
    first_name   text,
    items        jsonb
)
language sql
security definer
set search_path = public
stable
as $$
    select o.order_number, o.email, o.first_name, o.items
      from public.orders o
     where o.status = 'completed'
       and coalesce(btrim(o.email), '') <> ''
       and o.created_at < now() - make_interval(days => greatest(p_days, 1))
       -- Не просимо двічі.
       and not exists (
           select 1 from public.review_requests q
            where q.order_number = o.order_number
       )
       -- І не просимо в того, хто вже написав.
       and not exists (
           select 1 from public.reviews r
            where r.order_number = o.order_number
       )
     order by o.created_at
     limit greatest(p_limit, 1);
$$;

revoke all on function public.review_candidates(integer, integer) from public;
revoke all on function public.review_candidates(integer, integer) from anon, authenticated;
grant execute on function public.review_candidates(integer, integer) to service_role;


-- --------------------------------------
-- ЯК ПЕРЕВІРИТИ
--
--   -- скільки відгуків і в якому стані
--   select status, count(*) from public.reviews group by status;
--
--   -- що побачить сторінка товару
--   select * from public.product_reviews(20);
--
--   -- що піде в розмітку
--   select * from public.review_stats();
--
--   -- кому ще не писали
--   select order_number, email from public.review_candidates();
--
-- ОПУБЛІКУВАТИ РУКАМИ (якщо кнопки в Telegram недоступні):
--
--   update public.reviews set status = 'published' where id = 1;
-- --------------------------------------
