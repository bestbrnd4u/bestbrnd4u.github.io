-- ======================================
-- Мова замовлення — щоб листи покупцю приходили тією мовою, якою він
-- оформлював (українська, англійська чи російська версія сайту).
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
--
-- Потребує міграцій 019 (відгуки) і 026 (лист-подяка).
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Покупець з /en/ оформлює замовлення англійською — а лист «замовлення
-- прийнято», «відправлено», прохання про відгук і подяка зі знижкою
-- приходили б українською. Лист про статус читають через тиждень, і
-- це саме той момент, коли незрозумілий текст означає дзвінок або
-- повідомлення в Telegram з питанням «що з моїм замовленням».
--
-- Листи надсилаються в різні моменти й різними шляхами (функція при
-- зміні статусу, розклад GitHub для відгуків і подяки), тож мову треба
-- пам'ятати в самому замовленні.
--
-- ЧОМУ NULL, А НЕ 'uk' ЗА ЗАМОВЧУВАННЯМ
--
-- Порожньо = українська: так читають і функція, і скрипти. Старі
-- замовлення і замовлення з бота лишаються порожніми — нічого не
-- переписуємо. Обмеження нижче не дає записати щось інше, ніж три мови
-- сайту: значення приходить зі сторінки, тобто від покупця.
--
-- ЩО БУДЕ ДО ЦІЄЇ МІГРАЦІЇ
--
-- Сайт і функція готові до того, що колонки ще немає: запис
-- повторюється без мови (замовлення важливіше за мову листа), а лист
-- іде українською. Тобто порядок «спершу міграція, потім функція»
-- бажаний, але не обов'язковий.
-- --------------------------------------

alter table public.orders
    add column if not exists lang text;

alter table public.orders
    drop constraint if exists orders_lang_check;

alter table public.orders
    add constraint orders_lang_check check (lang is null or lang in ('uk', 'en', 'ru'));


-- --------------------------------------
-- Кандидати на лист про відгук і на подяку — тепер разом із мовою.
--
-- Тип результату змінюється (нова колонка), а create or replace цього
-- не дозволяє — тому спершу drop. Тіло — те саме, що в 019 і 026.
-- --------------------------------------

drop function if exists public.review_candidates(integer, integer);

create function public.review_candidates(p_days integer default 7, p_limit integer default 20)
returns table (
    order_number text,
    email        text,
    first_name   text,
    items        jsonb,
    lang         text
)
language sql
security definer
set search_path = public
stable
as $$
    select o.order_number, o.email, o.first_name, o.items, o.lang
      from public.orders o
     where o.status = 'completed'
       and coalesce(btrim(o.email), '') <> ''
       and o.created_at < now() - make_interval(days => greatest(p_days, 1))
       and not exists (
           select 1 from public.review_requests q
            where q.order_number = o.order_number
       )
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


drop function if exists public.thankyou_candidates(integer, integer);

create function public.thankyou_candidates(
    p_days  integer default 30,
    p_limit integer default 20
)
returns table (
    order_number text,
    email        text,
    first_name   text,
    total        numeric,
    lang         text
)
language sql
security definer
set search_path = public
stable
as $$
    select o.order_number, o.email, o.first_name, o.total, o.lang
      from public.orders o
     where o.status = 'completed'
       and coalesce(btrim(o.email), '') <> ''
       and o.created_at < now() - make_interval(days => greatest(p_days, 1))
       and not exists (
           select 1 from public.thankyou_sent t
            where t.order_number = o.order_number
       )
     order by o.created_at
     limit greatest(p_limit, 1)
$$;

revoke all on function public.thankyou_candidates(integer, integer) from public;
revoke all on function public.thankyou_candidates(integer, integer) from anon, authenticated;
grant execute on function public.thankyou_candidates(integer, integer) to service_role;


-- Перевірка: має повернути рядок «lang | text».
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'orders' and column_name = 'lang';
