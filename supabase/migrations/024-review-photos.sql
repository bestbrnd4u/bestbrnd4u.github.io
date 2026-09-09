-- ======================================
-- Фото у відгуках
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
--
-- Плейсхолдерів тут немає — нічого замінювати не треба.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Головне заперечення покупця на полиці 3 000-15 000 ₴ із логотипами
-- брендів — «чи це не підробка». Текстовий відгук на це відповідає,
-- фото відповідає краще: воно показує саме ту річ, що приїхала, при
-- звичайному світлі, а не в студії.
--
-- Друге, дрібніше, але щоденне: «а який він насправді на колір» і «а
-- який він насправді на розмір». Знімок покупця закриває обидва
-- питання без жодного листування.
--
-- ЧОМУ ФАЙЛИ КЛАДЕ ФУНКЦІЯ, А НЕ БРАУЗЕР
--
-- Дати браузеру право писати в сховище означає дати його всім: ключ
-- anon лежить у коді сторінки. Через годину після першого спамера
-- відро було б повне чужих файлів.
--
-- Тому шлях той самий, що в самих відгуків: браузер надсилає знімки
-- функції Edge разом із відгуком, функція перевіряє покупку, а вже
-- потім службовим ключем кладе файли у сховище. Політик запису для
-- anon тут немає навмисно.
-- --------------------------------------


-- --------------------------------------
-- 1. Де лежать файли
--
-- Відро ПУБЛІЧНЕ на читання: фото у відгуку — це саме те, що має
-- бачити кожен відвідувач, і підписані посилання тут лише додали б
-- роботи (їх треба перевипускати, вони протухають у кеші сторінки).
--
-- Запис у відро має ЛИШЕ службовий ключ: політик для anon немає, а
-- без політики RLS не пускає нікого.
--
-- Обмеження розміру й типів стоїть і тут, у самому відрі, хоча ті
-- самі перевірки робить функція. Це навмисне дублювання: перевірка у
-- функції захищає від помилки в даних, перевірка у відрі — від
-- помилки в самій функції.
-- --------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'review-photos',
    'review-photos',
    true,
    2097152,                                   -- 2 МБ на файл
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;


-- Читати може будь-хто. Саме читати: insert/update/delete лишаються
-- без політик, тобто доступні лише службовому ключу.
drop policy if exists "review photos are public" on storage.objects;

create policy "review photos are public"
    on storage.objects
    for select
    to public
    using (bucket_id = 'review-photos');


-- --------------------------------------
-- 2. Колонка з посиланнями
--
-- Масив адрес, а не окрема таблиця: фото не існують без свого
-- відгуку, разом із ним створюються й разом видаляються. Окрема
-- таблиця дала б з'єднання в кожному читанні й нічого не додала б.
--
-- Порядок у масиві — порядок показу.
-- --------------------------------------

alter table public.reviews
    add column if not exists photos text[] not null default '{}';


-- --------------------------------------
-- 3. Читання: фото віддаються разом із відгуком
--
-- Тип результату змінився, тож функцію треба саме ПЕРЕСТВОРИТИ:
-- create or replace відмовляється міняти набір колонок
-- («cannot change return type of existing function»).
--
-- Білий список полів лишається тим самим: ні номера замовлення, ні
-- телефону, ні статусу. Фото — публічні за задумом, решта — ні.
-- --------------------------------------

drop function if exists public.product_reviews(bigint);

create function public.product_reviews(p_product_id bigint)
returns table (
    author     text,
    rating     smallint,
    body       text,
    reply      text,
    photos     text[],
    created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
    select r.author, r.rating, r.body, r.reply, r.photos, r.created_at
      from public.reviews r
     where r.product_id = p_product_id
       and r.status = 'published'
     order by r.created_at desc
     limit 50;
$$;

grant execute on function public.product_reviews(bigint) to anon, authenticated;


-- --------------------------------------
-- 4. Запис: відгук разом із фото
--
-- Нова сигнатура — це НОВА функція: Postgres розрізняє їх за набором
-- аргументів, і стара лишилась би поруч, доступною службовому ключу.
-- Прибираємо її явно, щоб не було двох дверей в одну таблицю.
--
-- Кількість фото обмежена й тут. Функція Edge уже відрізала зайві, але
-- ця межа працює незалежно від того, звідки прийшов виклик, — так само
-- як перевірка існування замовлення нижче.
-- --------------------------------------

drop function if exists public.add_review(bigint, text, text, smallint, text);

create or replace function public.add_review(
    p_product_id   bigint,
    p_order_number text,
    p_author       text,
    p_rating       smallint,
    p_body         text,
    p_photos       text[] default '{}'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_author text;
    v_body   text;
    v_photos text[];
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

    -- Не більше трьох знімків і лише посилання на власне сховище.
    -- Чужа адреса тут означала б, що сторінка товару вантажить
    -- картинку з невідомого сайту — це і витік адрес відвідувачів, і
    -- готовий спосіб підмінити зображення після модерації.
    select coalesce(array_agg(url), '{}')
      into v_photos
      from (
          select url
            from unnest(coalesce(p_photos, '{}'::text[])) as url
           where url like '%/storage/v1/object/public/review-photos/%'
           limit 3
      ) as kept;

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
    --
    -- Фото ЗАМІНЮЮТЬСЯ, а не додаються: інакше після третього
    -- виправлення під відгуком висіла б галерея з дев'яти знімків, і
    -- прибрати зайве покупець не міг би.
    insert into public.reviews (product_id, order_number, author, rating, body, photos, status)
    values (p_product_id, p_order_number, v_author, p_rating, v_body, v_photos, 'new')
    on conflict (product_id, order_number) do update
        set author     = excluded.author,
            rating     = excluded.rating,
            body       = excluded.body,
            photos     = excluded.photos,
            status     = 'new',
            created_at = now()
    returning id into v_id;

    return v_id;

end;
$$;

revoke all on function public.add_review(bigint, text, text, smallint, text, text[]) from public;
revoke all on function public.add_review(bigint, text, text, smallint, text, text[]) from anon, authenticated;
grant execute on function public.add_review(bigint, text, text, smallint, text, text[]) to service_role;


-- --------------------------------------
-- ПЕРЕВІРКА
--
-- Після Run має повернути один рядок: відро на місці, колонка на
-- місці, обидві функції з новими сигнатурами.
-- --------------------------------------

select
    (select count(*) from storage.buckets where id = 'review-photos')            as відро,
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'reviews'
        and column_name = 'photos')                                              as колонка,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'add_review')                   as add_review,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'product_reviews')              as product_reviews;
