-- ======================================
-- Лист «дякуємо за покупку» з персональним промокодом
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
--
-- Потребує міграції 025 (промокоди зі строками й межею використань).
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Найдешевший покупець — той, що вже один раз заплатив: він знає
-- магазин, отримав річ і переконався, що вона справжня. Але після
-- «Виконано» магазин з ним більше не говорить ніколи.
--
-- Уся машинерія для цього вже стоїть: промокоди зі строком і межею
-- використань (025), розсилка, розклад, шаблони листів. Бракувало
-- самого кроку.
--
-- ЧОМУ ОКРЕМИМ ЛИСТОМ, А НЕ РАЗОМ ІЗ ПРОХАННЯМ ПРО ВІДГУК
--
-- Прохання про відгук іде на сьомий день. Покласти знижку в той
-- самий лист означало б запропонувати гроші за відгук — і виглядало
-- б саме так, незалежно від того, що код дається безумовно.
--
-- Тому окремо й пізніше: за замовчуванням на 30-й день, коли покупка
-- вже склалась, а привід повернутись ще актуальний.
-- --------------------------------------


-- --------------------------------------
-- 1. Кому вже писали
--
-- Той самий підхід, що з проханнями про відгук (review_requests):
-- пам'ятаємо номер замовлення, а не пошту. Одна людина може зробити
-- кілька замовлень, і кожне з них заслуговує на своє «дякуємо».
--
-- Зберігаємо ще й сам код: у панелі промокодів видно, що він
-- персональний, а тут — кому саме його дали.
-- --------------------------------------

create table if not exists public.thankyou_sent (

    order_number text        primary key,

    code         text        not null,

    sent_at      timestamptz not null default now()
);

alter table public.thankyou_sent enable row level security;


-- --------------------------------------
-- 2. Кому писати
--
-- Виконані замовлення старші за p_days, з поштою, яким ще не писали.
--
-- ЧОМУ НЕ ПЕРЕВІРЯЄМО, ЧИ ЛЮДИНА ВЖЕ ПОВЕРНУЛАСЬ. Друге замовлення —
-- це не привід не дякувати за перше. А от слати два «дякуємо» за одне
-- замовлення не можна, і саме це стереже таблиця вище.
-- --------------------------------------

create or replace function public.thankyou_candidates(
    p_days  integer default 30,
    p_limit integer default 20
)
returns table (
    order_number text,
    email        text,
    first_name   text,
    total        numeric
)
language sql
security definer
set search_path = public
stable
as $$
    select o.order_number, o.email, o.first_name, o.total
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


-- --------------------------------------
-- ПЕРЕВІРКА
--
-- Скільки замовлень чекає на «дякуємо» прямо зараз.
-- --------------------------------------

select count(*) as чекають from public.thankyou_candidates(30, 1000);
